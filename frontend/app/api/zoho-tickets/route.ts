import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getIp } from "@/lib/rateLimit";
import { pbFetch } from "@/lib/pb";

export async function GET(req: NextRequest) {
  const { ok } = rateLimit(getIp(req), 60, 60_000);
  if (!ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const accountId = new URL(req.url).searchParams.get("account_id");
  if (!accountId) return NextResponse.json({ error: "account_id required" }, { status: 400 });

  try {
    const filter = encodeURIComponent(`account_id="${accountId}"`);
    const res  = await pbFetch(`/api/collections/zoho_tickets/records?filter=${filter}&sort=-created_time&perPage=50`);
    const data = await res.json();
    return NextResponse.json({ tickets: data.items || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
