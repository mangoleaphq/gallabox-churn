import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getIp } from "@/lib/rateLimit";

const PB = process.env.PB_BASE || "http://127.0.0.1:8090";

export async function GET(req: NextRequest) {
  const { ok } = rateLimit(getIp(req), 60, 60_000);
  if (!ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("account_id");

  if (!accountId) {
    return NextResponse.json({ error: "account_id required" }, { status: 400 });
  }

  try {
    const filter = encodeURIComponent(`account_id="${accountId}"`);
    const res = await fetch(
      `${PB}/api/collections/zoho_tickets/records?filter=${filter}&sort=-created_time&perPage=50`,
      { next: { revalidate: 300 } } // cache 5 mins
    );
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch tickets" }, { status: 500 });
    }
    const data = await res.json();
    return NextResponse.json({ tickets: data.items || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
