#!/usr/bin/env python3
"""
Churn Analysis Ingestion Pipeline
Pulls accounts from Chargebee -> PocketBase.

Usage:
  python3 ingest.py          # delta sync: only accounts updated in last 25h
  python3 ingest.py --full   # full sync: all accounts (auto on first run)
"""

import json, urllib.request, urllib.parse, urllib.error, base64, os, sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(__file__))
from config import PB_BASE, PB_EMAIL, PB_PASSWORD, CB_SITE, CB_KEY

FULL = "--full" in sys.argv
CB_CREDS = base64.b64encode(f"{CB_KEY}:".encode()).decode()

# ── PocketBase ─────────────────────────────────────────────────────────────────
def pb_auth():
    body = json.dumps({"identity": PB_EMAIL, "password": PB_PASSWORD}).encode()
    req = urllib.request.Request(
        f"{PB_BASE}/api/collections/_superusers/auth-with-password",
        data=body, headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())["token"]

def pb_request(method, path, data=None, token=None):
    body = json.dumps(data).encode() if data else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{PB_BASE}{path}", data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read()), None
    except urllib.error.HTTPError as e:
        return None, e.read().decode()

def pb_account_count(token):
    res, _ = pb_request("GET", "/api/collections/accounts/records?perPage=1", token=token)
    return res.get("totalItems", 0) if res else 0

# ── Chargebee ──────────────────────────────────────────────────────────────────
def cb_get(path):
    url = f"https://{CB_SITE}/api/v2/{path}"
    req = urllib.request.Request(url, headers={"Authorization": f"Basic {CB_CREDS}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def fetch_chargebee_customers(since=None):
    label = f"updated after {datetime.fromtimestamp(since).strftime('%Y-%m-%d %H:%M')}" if since else "all"
    print(f"Fetching Chargebee customers ({label})...")
    all_customers = []
    offset = None
    page = 0
    while True:
        path = "customers?limit=100&sort_by[desc]=updated_at"
        if since:
            path += f"&updated_at[after]={since}"
        if offset:
            path += f"&offset={urllib.parse.quote(str(offset))}"
        data = cb_get(path)
        batch = [x["customer"] for x in data.get("list", [])]
        all_customers.extend(batch)
        page += 1
        print(f"  Page {page}: {len(batch)} customers (total: {len(all_customers)})")
        next_offset = data.get("next_offset")
        if not next_offset:
            break
        offset = next_offset
    print(f"  Total: {len(all_customers)} customers")
    return all_customers

def fetch_subscriptions():
    print("Fetching subscriptions...")
    subs = {}
    offset = None
    while True:
        path = "subscriptions?limit=100&status[is_not]=cancelled"
        if offset:
            path += f"&offset={urllib.parse.quote(str(offset))}"
        data = cb_get(path)
        for item in data.get("list", []):
            s = item["subscription"]
            cid = s.get("customer_id")
            if cid not in subs:
                items_list = s.get("subscription_items", [])
                plan = items_list[0].get("item_price_id", "N/A") if items_list else "N/A"
                subs[cid] = {
                    "plan":            plan,
                    "status":          s.get("status"),
                    "mrr":             s.get("mrr", 0),
                    "currency":        s.get("currency_code", ""),
                    "next_billing_at": s.get("next_billing_at") or s.get("current_term_end") or 0,
                }
        next_offset = data.get("next_offset")
        if not next_offset:
            break
        offset = next_offset
    print(f"  Total unique subscriptions: {len(subs)}")
    return subs

# ── PocketBase upsert ──────────────────────────────────────────────────────────
def upsert_account(token, chargebee_id, record):
    encoded = urllib.parse.quote(f'chargebee_id="{chargebee_id}"')
    res, _ = pb_request("GET", f"/api/collections/accounts/records?filter={encoded}", token=token)
    if res and res.get("items"):
        pb_id = res["items"][0]["id"]
        pb_request("PATCH", f"/api/collections/accounts/records/{pb_id}", record, token)
        return pb_id
    res2, _ = pb_request("POST", "/api/collections/accounts/records", record, token)
    return res2["id"] if res2 else None

# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    print("\n=== Churn Analysis Ingestion Pipeline ===\n")

    token = pb_auth()
    print("✓ PocketBase auth OK\n")

    # Auto full-sync on first run (no accounts yet), delta on subsequent runs
    existing = pb_account_count(token)
    full  = FULL or existing == 0
    since = None if full else int((datetime.now() - timedelta(hours=25)).timestamp())

    if full:
        print(f"Mode: FULL sync{' (first run — no accounts in PocketBase)' if existing == 0 else ''}")
    else:
        print(f"Mode: DELTA sync (last 25h, {existing} accounts already in PocketBase)")

    customers = fetch_chargebee_customers(since=since)
    subs      = fetch_subscriptions()

    # Save subs snapshot so score_v3 doesn't need a second Chargebee call
    _data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
    os.makedirs(_data_dir, exist_ok=True)
    json.dump(subs, open(os.path.join(_data_dir, "subs_live.json"), "w"))
    print(f"✓ Saved data/subs_live.json ({len(subs)} subscriptions)\n")

    print(f"Upserting {len(customers)} accounts into PocketBase...")
    written = skipped = 0

    for c in customers:
        cb_id    = c.get("id")
        sub      = subs.get(cb_id, {})
        amp_id   = c.get("cf_Account_ID", "")
        email    = c.get("cf_Account_Email") or c.get("email", "")
        company  = c.get("cf_Account_name") or c.get("company", "Unknown")
        currency = c.get("preferred_currency_code", "INR")

        record = {
            "chargebee_id":     cb_id,
            "amplitude_id":     amp_id,
            "company":          company[:100],
            "email":            email[:200] if email else "",
            "plan":             sub.get("plan", "unknown")[:100],
            "mrr":              sub.get("mrr", 0) / 100,
            "currency":         sub.get("currency", currency),
            "status":           sub.get("status", "unknown"),
            "channel_provider": c.get("cf_Channel_Provider", ""),
            "cb_created_at":    str(c.get("created_at", "")),
        }

        pb_id = upsert_account(token, cb_id, record)
        if pb_id:
            written += 1
        else:
            skipped += 1

        if written % 100 == 0 and written > 0:
            print(f"  {written} accounts written...")

    print(f"\n=== Done ===")
    print(f"  Written:  {written}")
    print(f"  Skipped:  {skipped}")

if __name__ == "__main__":
    main()
