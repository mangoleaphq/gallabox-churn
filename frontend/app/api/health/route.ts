import { NextResponse } from "next/server";
import { stat } from "fs/promises";
import path from "path";

const PB_BASE = process.env.PB_BASE || "http://127.0.0.1:8090";

export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  // PocketBase
  try {
    const res = await fetch(`${PB_BASE}/api/health`, { signal: AbortSignal.timeout(3000) });
    checks.pocketbase = { ok: res.ok };
  } catch (e: any) {
    checks.pocketbase = { ok: false, detail: e.message };
  }

  // Subscription cache freshness
  try {
    const subsPath = path.join(process.cwd(), "..", "data", "subs_live.json");
    const s = await stat(subsPath);
    const ageMinutes = Math.round((Date.now() - s.mtimeMs) / 60000);
    const stale = ageMinutes > 120;
    checks.subs_cache = {
      ok: !stale,
      detail: `last updated ${ageMinutes} min ago${stale ? " — run fetch_subs.py" : ""}`,
    };
  } catch {
    checks.subs_cache = { ok: false, detail: "data/subs_live.json not found — run fetch_subs.py" };
  }

  const allOk = Object.values(checks).every((c) => c.ok);
  return NextResponse.json(
    { status: allOk ? "ok" : "degraded", checks },
    { status: allOk ? 200 : 503 }
  );
}
