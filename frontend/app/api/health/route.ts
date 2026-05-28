import { NextResponse } from "next/server";
import { getPbToken, pbFetch } from "@/lib/pb";

const PB_BASE = process.env.PB_BASE || "http://127.0.0.1:8090";

export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  // PocketBase reachability
  try {
    const res = await fetch(`${PB_BASE}/api/health`, { signal: AbortSignal.timeout(3000) });
    checks.pocketbase = { ok: res.ok };
  } catch (e: any) {
    checks.pocketbase = { ok: false, detail: e.message };
  }

  // Data freshness — check accounts collection has records (i.e. ingest has run)
  try {
    await getPbToken();
    const res  = await pbFetch("/api/collections/accounts/records?perPage=1");
    const json = await res.json();
    const count = json.totalItems ?? 0;
    checks.data = {
      ok: count > 0,
      detail: count > 0 ? `${count} accounts` : "no accounts — run ingest.py",
    };
  } catch (e: any) {
    checks.data = { ok: false, detail: e.message };
  }

  const allOk = Object.values(checks).every((c) => c.ok);
  return NextResponse.json(
    { status: allOk ? "ok" : "degraded", checks },
    { status: allOk ? 200 : 503 }
  );
}
