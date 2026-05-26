import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.AMPLITUDE_API_KEY!;
const SECRET_KEY = process.env.AMPLITUDE_SECRET_KEY!;
const BASE = "https://amplitude.com/api/2";

function auth() {
  return "Basic " + Buffer.from(`${API_KEY}:${SECRET_KEY}`).toString("base64");
}

function yyyymmdd(d: Date) {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function weeksAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n * 7);
  return d;
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

export async function GET(req: NextRequest) {
  const amplitudeId = req.nextUrl.searchParams.get("amplitude_id");
  if (!amplitudeId) {
    return NextResponse.json({ error: "amplitude_id required" }, { status: 400 });
  }
  if (!API_KEY || !SECRET_KEY) {
    return NextResponse.json({ error: "Amplitude credentials not configured" }, { status: 500 });
  }

  const today = new Date();
  const segment = JSON.stringify([{
    filters: [{
      subprop_type: "user",
      subprop_key: "accountId",
      subprop_op: "is",
      subprop_value: [amplitudeId],
    }],
  }]);
  const headers = { Authorization: auth() };

  // WAU: weekly active users over the last 8 weeks
  const wauParams = new URLSearchParams({
    e: JSON.stringify({ event_type: "_active" }),
    m: "uniques",
    start: yyyymmdd(weeksAgo(8)),
    end: yyyymmdd(today),
    i: "7",
    s: segment,
  });

  // Active users last 30 days (single monthly bucket)
  const mauParams = new URLSearchParams({
    e: JSON.stringify({ event_type: "_active" }),
    m: "uniques",
    start: yyyymmdd(daysAgo(30)),
    end: yyyymmdd(today),
    i: "30",
    s: segment,
  });

  try {
    const [wauResp, mauResp] = await Promise.all([
      fetch(`${BASE}/events/segmentation?${wauParams}`, { headers }),
      fetch(`${BASE}/events/segmentation?${mauParams}`, { headers }),
    ]);

    if (!wauResp.ok || !mauResp.ok) {
      const errText = await wauResp.text();
      return NextResponse.json({ error: `Amplitude API error: ${wauResp.status}`, detail: errText }, { status: 502 });
    }

    const [wauData, mauData] = await Promise.all([wauResp.json(), mauResp.json()]);

    const wau: { week: string; users: number }[] = (wauData.data?.xValues || []).map(
      (week: string, i: number) => ({
        week,
        users: wauData.data?.series?.[0]?.[i] ?? 0,
      })
    );

    const lastActiveWeek = [...wau].reverse().find((w) => w.users > 0) ?? null;
    const activeUsers30d: number = mauData.data?.series?.[0]?.[0] ?? 0;

    return NextResponse.json({
      wau,
      active_users_30d: activeUsers30d,
      last_active_week: lastActiveWeek?.week ?? null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to fetch Amplitude data", detail: err?.message }, { status: 500 });
  }
}
