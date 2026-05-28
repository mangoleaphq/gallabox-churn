import { NextResponse } from "next/server";

const PB_BASE = process.env.PB_BASE || "http://127.0.0.1:8090";
const PB_EMAIL = process.env.PB_EMAIL || "";
const PB_PASSWORD = process.env.PB_PASSWORD || "";

async function getPbToken(): Promise<string | null> {
  try {
    const res = await fetch(`${PB_BASE}/api/collections/_superusers/auth-with-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity: PB_EMAIL, password: PB_PASSWORD }),
      signal: AbortSignal.timeout(3000),
    });
    const json = await res.json();
    return json.token ?? null;
  } catch {
    return null;
  }
}

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
    const token = await getPbToken();
    if (!token) throw new Error("auth failed");
    const res = await fetch(`${PB_BASE}/api/collections/accounts/records?perPage=1`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3000),
    });
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
