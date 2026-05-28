import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getIp } from "@/lib/rateLimit";
import { pbFetch } from "@/lib/pb";

function mom(curr: number, prev: number): number {
  if (!prev || prev === 0) return 0;
  return Math.round(((curr - prev) / prev) * 100);
}

// Detect if a month is still in progress (current calendar month)
function isPartialMonth(month: string): boolean {
  const now = new Date();
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return month === current;
}

// new_contacts anomaly: flag if it's >10x the rolling average of prior months
function isAnomalous(value: number, priorValues: number[]): boolean {
  const valid = priorValues.filter(v => v > 0);
  if (valid.length < 2) return false;
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
  return avg > 0 && value > avg * 8;
}

export async function GET(req: NextRequest) {
  const { ok } = rateLimit(getIp(req), 30, 60_000);
  if (!ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  try {
    const res = await pbFetch("/api/collections/monthly_metrics/records?sort=month&perPage=100");
    const json = await res.json();
    const raw: Record<string, any>[] = json.items || [];

    if (raw.length === 0) {
      return NextResponse.json({ ok: false, error: "No metrics data in PocketBase yet" });
    }

    // Normalize all numeric fields
    const rows = raw.map((r) => {
      const out: Record<string, any> = {};
      const skip = new Set(["id", "collectionId", "collectionName", "created", "updated"]);
      for (const [k, v] of Object.entries(r)) {
        if (skip.has(k)) continue;
        out[k] = typeof v === "string" && /^-?[\d.]+$/.test(v) ? parseFloat(v) : v;
      }
      return out;
    });

    // Compute MoM dynamically (override stale stored zeros)
    const data = rows.map((r, i) => {
      const p = i > 0 ? rows[i - 1] : null;
      const partial = isPartialMonth(r.month);

      // Detect anomalous new_contacts
      const priorNewContacts = rows.slice(Math.max(0, i - 6), i).map(x => x.new_contacts || 0);
      const newContactsAnomaly = isAnomalous(r.new_contacts || 0, priorNewContacts);

      return {
        ...r,
        is_partial: partial,
        new_contacts_anomaly: newContactsAnomaly,

        // Recompute all MoM values from actual data
        convos_mom:        p ? mom(r.total_conversations, p.total_conversations) : 0,
        accounts_mom:      p ? mom(r.active_accounts, p.active_accounts) : 0,
        frt_mom:           p ? mom(r.avg_frt_mins, p.avg_frt_mins) : 0,
        bot_mom:           p ? mom(r.bot, p.bot) : 0,
        broadcast_mom:     p ? mom(r.broadcast, p.broadcast) : 0,
        sequence_mom:      p ? mom(r.sequence, p.sequence) : 0,
        new_contacts_mom:  p ? mom(r.new_contacts, p.new_contacts) : 0,

        // % share by medium (compute here so frontend doesn't need to)
        medium_total: (r.broadcast || 0) + (r.bot || 0) + (r.api || 0) + (r.inbox || 0) + (r.sequence || 0) + (r.integration || 0) + (r.system || 0),
        broadcast_pct:   0,
        bot_pct:         0,
        api_pct:         0,
        inbox_pct:       0,
        sequence_pct:    0,
        integration_pct: 0,
      };
    });

    // Now fill in pct fields
    for (const r of data as any[]) {
      const t = r.medium_total || 1;
      r.broadcast_pct   = Math.round((r.broadcast   || 0) / t * 100);
      r.bot_pct         = Math.round((r.bot         || 0) / t * 100);
      r.api_pct         = Math.round((r.api         || 0) / t * 100);
      r.inbox_pct       = Math.round((r.inbox       || 0) / t * 100);
      r.sequence_pct    = Math.round((r.sequence    || 0) / t * 100);
      r.integration_pct = Math.round((r.integration || 0) / t * 100);
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
