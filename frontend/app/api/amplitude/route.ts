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

export async function GET(req: NextRequest) {
  const amplitudeId = req.nextUrl.searchParams.get("amplitude_id");
  if (!amplitudeId) {
    return NextResponse.json({ error: "amplitude_id required" }, { status: 400 });
  }
  if (!API_KEY || !SECRET_KEY) {
    return NextResponse.json({ error: "Amplitude credentials not configured" }, { status: 500 });
  }

  const today = new Date();
  const start = new Date();
  start.setDate(today.getDate() - 29); // 30 days inclusive

  const accountProp = process.env.AMPLITUDE_ACCOUNT_PROP;
  const segment = accountProp
    ? JSON.stringify([{
        name: "Segment 1",
        filters: [{
          subprop_type: "user",
          subprop_key: accountProp,
          subprop_op: "is",
          subprop_value: [amplitudeId],
        }],
      }])
    : undefined;

  const params = new URLSearchParams({
    e: JSON.stringify({ event_type: "_active" }),
    m: "uniques",
    start: yyyymmdd(start),
    end: yyyymmdd(today),
    i: "1",
  });
  if (segment) params.set("s", segment);

  const url = `${BASE}/events/segmentation?${params}`;

  try {
    const resp = await fetch(url, { headers: { Authorization: auth() } });
    const body = await resp.json();

    if (!resp.ok) {
      return NextResponse.json(
        { error: `Amplitude API error: ${resp.status}`, detail: JSON.stringify(body) },
        { status: 502 }
      );
    }

    const xValues: string[] = body.data?.xValues || [];
    const series: number[] = body.data?.series?.[0] || [];

    const daily = xValues.map((date, i) => ({ date, users: series[i] ?? 0 }));
    const lastActive = [...daily].reverse().find((d) => d.users > 0) ?? null;
    const maxDau = daily.length > 0 ? Math.max(...daily.map((d) => d.users)) : 0;
    const activeDays = daily.filter((d) => d.users > 0).length;

    // Group into weeks (last 4 complete weeks + partial current week)
    const wau: { week: string; users: number }[] = [];
    for (let i = 0; i < daily.length; i += 7) {
      const slice = daily.slice(i, i + 7);
      const weekMax = Math.max(...slice.map((d) => d.users));
      wau.push({ week: slice[0]?.date ?? "", users: weekMax });
    }

    return NextResponse.json({
      daily,
      wau,
      max_dau: maxDau,
      active_days_30d: activeDays,
      last_active_date: lastActive?.date ?? null,
      is_filtered: !!accountProp,
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to fetch Amplitude data", detail: err?.message }, { status: 500 });
  }
}
