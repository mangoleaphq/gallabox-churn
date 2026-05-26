#!/usr/bin/env python3
"""
Refresh monthly_metrics in PocketBase from ClickHouse.
Queries the last 18 months of data and upserts each month row.

Usage:
    python3 refresh_monthly_metrics.py
    python3 refresh_monthly_metrics.py --months 3   # only last 3 months
"""
import json, urllib.request, urllib.error, urllib.parse, base64, ssl, sys, os, subprocess
from datetime import datetime, date

sys.path.insert(0, os.path.dirname(__file__))
from config import PB_BASE, PB_EMAIL, PB_PASSWORD, CH_HOST, CH_USER, CH_PASS

MONTHS = 18  # how many months back to fetch
if "--months" in sys.argv:
    idx = sys.argv.index("--months")
    MONTHS = int(sys.argv[idx + 1])

# ── ClickHouse ────────────────────────────────────────────────────────────────
def ch_query(sql):
    """Run SQL via curl — avoids Python ssl EOF issues on large result sets."""
    result = subprocess.run(
        ["curl", "-s", "--max-time", "180", "-u", f"{CH_USER}:{CH_PASS}",
         CH_HOST, "--data-binary", sql + " FORMAT JSON"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        raise RuntimeError(f"curl failed: {result.stderr}")
    try:
        return json.loads(result.stdout).get("data", [])
    except json.JSONDecodeError:
        raise RuntimeError(f"Bad JSON from CH: {result.stdout[:300]}")

# ── PocketBase ────────────────────────────────────────────────────────────────
_token = None

def pb_auth():
    global _token
    if _token:
        return _token
    body = json.dumps({"identity": PB_EMAIL, "password": PB_PASSWORD}).encode()
    req = urllib.request.Request(
        f"{PB_BASE}/api/collections/_superusers/auth-with-password",
        data=body, headers={"Content-Type": "application/json"}, method="POST",
    )
    with urllib.request.urlopen(req) as r:
        _token = json.loads(r.read())["token"]
    return _token

def pb(method, path, data=None):
    token = pb_auth()
    body = json.dumps(data).encode() if data else None
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
    req = urllib.request.Request(f"{PB_BASE}{path}", data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return json.loads(raw) if raw.strip() else {}, None
    except urllib.error.HTTPError as e:
        return None, e.read().decode()

def get_existing_months():
    """Return dict of month -> record_id for all existing rows."""
    result, err = pb("GET", "/api/collections/monthly_metrics/records?perPage=200&fields=id,month")
    if err or not result:
        return {}
    return {r["month"]: r["id"] for r in result.get("items", [])}

# ── Helpers ───────────────────────────────────────────────────────────────────
def is_partial(month_str):
    now = date.today()
    current = f"{now.year}-{now.month:02d}"
    return month_str == current

def mom(curr, prev):
    if not prev or prev == 0:
        return 0
    return round(((curr - prev) / prev) * 100)

# ── Main queries ──────────────────────────────────────────────────────────────
def fetch_conversation_metrics():
    print("  [1/5] Conversation metrics...")
    sql = f"""
    SELECT
        toStartOfMonth(createdAt) AS m,
        COUNT()                                                        AS total_conversations,
        COUNTIf(resolvedAt IS NOT NULL)                                AS resolved_conversations,
        COUNTIf(channelType = 'whatsapp')                              AS whatsapp_convos,
        COUNTIf(channelType = 'web')                                   AS web_convos,
        COUNTIf(channelType = 'instagram')                             AS instagram_convos,
        COUNT(DISTINCT accountId)                                      AS active_accounts,
        COUNT(DISTINCT assigneeId)                                     AS active_agents,
        COUNT(DISTINCT botId)                                          AS active_bots,
        ROUND(AVGIf(firstRespondedInMilliSeconds / 60000.0,
            firstRespondedAt IS NOT NULL), 1)                          AS avg_frt_mins,
        ROUND(AVGIf(timeToResolveInMilliSeconds / 60000.0,
            resolvedAt IS NOT NULL), 1)                                AS avg_ttr_mins,
        COUNTIf(botId != '' AND botId IS NOT NULL)                     AS bot_conversations,
        COUNT(DISTINCT IF(botId != '' AND botId IS NOT NULL,
            accountId, NULL))                                          AS bot_accounts,
        COUNTDistinctIf(contactId,
            isNewContactConversation = true AND contactId != '')        AS new_contacts
    FROM default.conversations
    WHERE createdAt >= toStartOfMonth(now() - INTERVAL {MONTHS} MONTH)
      AND accountId != ''
    GROUP BY m
    ORDER BY m
    """
    return {r["m"][:7]: r for r in ch_query(sql)}

def fetch_message_mediums():
    print("  [2/5] Message medium breakdown...")
    sql = f"""
    SELECT
        toStartOfMonth(createdAt) AS m,
        COUNTIf(context_medium = 'broadcast')                         AS broadcast,
        COUNTIf(context_medium = 'bot')                               AS bot,
        COUNTIf(context_medium = 'api')                               AS api,
        COUNTIf(context_medium = 'inbox')                             AS inbox,
        COUNTIf(context_medium = 'sequence')                          AS sequence,
        COUNTIf(context_medium = 'integration')                       AS integration,
        COUNTIf(context_medium = 'system')                            AS system,
        COUNT(DISTINCT IF(context_medium='broadcast', accountId, NULL)) AS broadcast_accounts,
        COUNT(DISTINCT IF(context_medium='bot',       accountId, NULL)) AS bot_msg_accounts,
        COUNT(DISTINCT IF(context_medium='sequence',  accountId, NULL)) AS sequence_accounts
    FROM default.messages
    WHERE createdAt >= toStartOfMonth(now() - INTERVAL {MONTHS} MONTH)
      AND accountId != ''
    GROUP BY m
    ORDER BY m
    """
    return {r["m"][:7]: r for r in ch_query(sql)}

def fetch_channel_counts():
    print("  [3/5] Channel counts...")
    sql = f"""
    SELECT
        toStartOfMonth(createdAt) AS m,
        COUNTIf(channelType = 'whatsapp') AS whatsapp_channels,
        COUNTIf(channelType = 'web')      AS web_channels,
        COUNTIf(channelType = 'instagram') AS instagram_channels,
        COUNT(DISTINCT accountId)          AS accounts_with_channels
    FROM default.channels
    WHERE createdAt >= toStartOfMonth(now() - INTERVAL {MONTHS} MONTH)
      AND accountId != ''
      AND (isDeleted = 'false' OR isDeleted = '')
    GROUP BY m
    ORDER BY m
    """
    return {r["m"][:7]: r for r in ch_query(sql)}

def fetch_accounts_using_bots():
    """Count distinct accounts that had bot conversations each month."""
    print("  [4/5] Bot-active accounts...")
    sql = f"""
    SELECT
        toStartOfMonth(createdAt) AS m,
        COUNT(DISTINCT accountId) AS accounts_using_bots
    FROM default.conversations
    WHERE createdAt >= toStartOfMonth(now() - INTERVAL {MONTHS} MONTH)
      AND accountId != ''
      AND botId != ''
      AND botId IS NOT NULL
    GROUP BY m
    ORDER BY m
    """
    return {r["m"][:7]: r for r in ch_query(sql)}

def fetch_crm_integrations():
    """Integration messages split by CRM type using context_medium detail."""
    print("  [5/5] CRM integrations (zoho/hubspot/pipedrive accounts)...")
    # Use messages table with integration-related context fields if available,
    # otherwise fall back to counting distinct accounts per integration medium
    sql = f"""
    SELECT
        toStartOfMonth(createdAt)                                    AS m,
        COUNTIf(lower(context_medium) LIKE '%zoho%')                 AS zoho_bulk,
        COUNTIf(lower(context_medium) LIKE '%hubspot%')              AS hubspot_workflow,
        COUNTIf(lower(context_medium) LIKE '%pipedrive%')            AS pipedrive_widget,
        COUNT(DISTINCT IF(lower(context_medium) LIKE '%zoho%',     accountId, NULL)) AS zoho_accounts,
        COUNT(DISTINCT IF(lower(context_medium) LIKE '%hubspot%',  accountId, NULL)) AS hubspot_accounts,
        COUNT(DISTINCT IF(lower(context_medium) LIKE '%pipedrive%',accountId, NULL)) AS pipedrive_accounts
    FROM default.messages
    WHERE createdAt >= toStartOfMonth(now() - INTERVAL {MONTHS} MONTH)
      AND accountId != ''
    GROUP BY m
    ORDER BY m
    """
    return {r["m"][:7]: r for r in ch_query(sql)}

# ── Build & upsert ────────────────────────────────────────────────────────────
def build_rows(conv, msgs, chans, bots, crm):
    months = sorted(set(list(conv.keys()) + list(msgs.keys())))
    rows = []
    for i, month in enumerate(months):
        c = conv.get(month, {})
        m = msgs.get(month, {})
        ch = chans.get(month, {})
        b = bots.get(month, {})
        cr = crm.get(month, {})

        total_c = int(c.get("total_conversations") or 0)
        resolved_c = int(c.get("resolved_conversations") or 0)
        res_pct = round((resolved_c / total_c * 100), 1) if total_c > 0 else 0

        row = {
            "month": month,
            "total_conversations":   total_c,
            "resolved_conversations": resolved_c,
            "resolution_rate_pct":   res_pct,
            "whatsapp_convos":       int(c.get("whatsapp_convos") or 0),
            "web_convos":            int(c.get("web_convos") or 0),
            "instagram_convos":      int(c.get("instagram_convos") or 0),
            "active_accounts":       int(c.get("active_accounts") or 0),
            "active_agents":         int(c.get("active_agents") or 0),
            "active_bots":           int(c.get("active_bots") or 0),
            "avg_frt_mins":          float(c.get("avg_frt_mins") or 0),
            "avg_ttr_mins":          float(c.get("avg_ttr_mins") or 0),
            "bot_conversations":     int(c.get("bot_conversations") or 0),
            "bot_accounts":          int(c.get("bot_accounts") or 0),
            "accounts_using_bots":   int(b.get("accounts_using_bots") or 0),
            "new_contacts":          int(c.get("new_contacts") or 0),
            # message mediums
            "broadcast":    int(m.get("broadcast") or 0),
            "bot":          int(m.get("bot") or 0),
            "api":          int(m.get("api") or 0),
            "inbox":        int(m.get("inbox") or 0),
            "sequence":     int(m.get("sequence") or 0),
            "integration":  int(m.get("integration") or 0),
            "system":       int(m.get("system") or 0),
            "broadcast_accounts": int(m.get("broadcast_accounts") or 0),
            "sequence_accounts":  int(m.get("sequence_accounts") or 0),
            # channels
            "whatsapp_channels":     int(ch.get("whatsapp_channels") or 0),
            "web_channels":          int(ch.get("web_channels") or 0),
            "instagram_channels":    int(ch.get("instagram_channels") or 0),
            "accounts_with_channels": int(ch.get("accounts_with_channels") or 0),
            # CRM
            "zoho_bulk":          int(cr.get("zoho_bulk") or 0),
            "zoho_accounts":      int(cr.get("zoho_accounts") or 0),
            "hubspot_workflow":   int(cr.get("hubspot_workflow") or 0),
            "hubspot_accounts":   int(cr.get("hubspot_accounts") or 0),
            "pipedrive_widget":   int(cr.get("pipedrive_widget") or 0),
            "pipedrive_accounts": int(cr.get("pipedrive_accounts") or 0),
            # MoM (computed vs previous row)
            "convos_mom":        0,
            "accounts_mom":      0,
            "frt_mom":           0,
            "bot_mom":           0,
            "broadcast_mom":     0,
            "sequence_mom":      0,
            "new_contacts_mom":  0,
        }

        if i > 0:
            prev = rows[i - 1]
            row["convos_mom"]       = mom(row["total_conversations"],   prev["total_conversations"])
            row["accounts_mom"]     = mom(row["active_accounts"],       prev["active_accounts"])
            row["frt_mom"]          = mom(row["avg_frt_mins"],          prev["avg_frt_mins"])
            row["bot_mom"]          = mom(row["bot"],                   prev["bot"])
            row["broadcast_mom"]    = mom(row["broadcast"],             prev["broadcast"])
            row["sequence_mom"]     = mom(row["sequence"],              prev["sequence"])
            row["new_contacts_mom"] = mom(row["new_contacts"],          prev["new_contacts"])

        rows.append(row)
    return rows

def upsert_rows(rows):
    existing = get_existing_months()
    print(f"\n  Upserting {len(rows)} month rows ({len(existing)} already in DB)...")

    created = updated = failed = 0
    for row in rows:
        month = row["month"]
        if month in existing:
            rec_id = existing[month]
            _, err = pb("PATCH", f"/api/collections/monthly_metrics/records/{rec_id}", row)
            if err:
                print(f"    FAIL update {month}: {err[:100]}")
                failed += 1
            else:
                print(f"    updated {month}")
                updated += 1
        else:
            _, err = pb("POST", "/api/collections/monthly_metrics/records", row)
            if err:
                print(f"    FAIL create {month}: {err[:100]}")
                failed += 1
            else:
                print(f"    created {month}")
                created += 1

    print(f"\n  Done: {created} created, {updated} updated, {failed} failed")

# ── Run ───────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print(f"Fetching {MONTHS} months of metrics from ClickHouse...")
    conv  = fetch_conversation_metrics()
    msgs  = fetch_message_mediums()
    chans = fetch_channel_counts()
    bots  = fetch_accounts_using_bots()
    crm   = fetch_crm_integrations()

    print(f"\nBuilding rows for months: {sorted(set(list(conv.keys()) + list(msgs.keys())))}")
    rows = build_rows(conv, msgs, chans, bots, crm)

    upsert_rows(rows)
    print("\nDone! Refresh the metrics page to see updated data.")
