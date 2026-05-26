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

const FEATURES = [
  { name: "Broadcasts",  event: "BRCST_SEND" },
  { name: "Bot Flows",   event: "BOT_PUBLISH" },
  { name: "Sequences",   event: "SEQ_SAVE" },
  { name: "WA Flows",    event: "WAFLOW Publish Flow" },
  { name: "Instagram",   event: "IG Posts Comment Automation Toggle Clicked" },
  { name: "Templates",   event: "WAT_USE" },
  { name: "AI Reply",    event: "CON_AI ASSIST_AI REPLY DRAFT_SEND" },
  { name: "Payments",    event: "PAY_SEND_REQ_CONFIRM" },
  { name: "Pipelines",   event: "PPLN Create Lead" },
];

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
  start.setDate(today.getDate() - 29);

  const accountProp = process.env.AMPLITUDE_ACCOUNT_PROP;
  const segment = accountProp
    ? JSON.stringify([{ prop: `gp:${accountProp}`, op: "is", values: [amplitudeId] }])
    : undefined;

  const headers = { Authorization: auth() };
  const dateRange = { start: yyyymmdd(start), end: yyyymmdd(today), i: "1" };

  function segParams(eventType: string, metric: string) {
    const p = new URLSearchParams({ e: JSON.stringify({ event_type: eventType }), m: metric, ...dateRange });
    if (segment) p.set("s", segment);
    return p;
  }

  async function fetchSegmentation(eventType: string, metric: string) {
    const resp = await fetch(`${BASE}/events/segmentation?${segParams(eventType, metric)}`, { headers });
    const body = await resp.json();
    if (!resp.ok) throw new Error(`${resp.status}:${JSON.stringify(body)}`);
    return body;
  }

  async function batchFetch<T>(tasks: (() => Promise<T>)[], size: number): Promise<T[]> {
    const results: T[] = [];
    for (let i = 0; i < tasks.length; i += size) {
      const batch = await Promise.all(tasks.slice(i, i + size).map(t => t()));
      results.push(...batch);
    }
    return results;
  }

  try {
    const allTasks = [
      () => fetchSegmentation("_active", "uniques"),
      () => fetchSegmentation("session_start", "totals"),
      ...FEATURES.map(f => () => fetchSegmentation(f.event, "totals")),
    ];

    const [dauData, sessionData, ...featureData] = await batchFetch(allTasks, 3);

    const xValues: string[] = dauData.data?.xValues || [];
    const dauSeries: number[] = dauData.data?.series?.[0] || [];
    const daily = xValues.map((date, i) => ({ date, users: dauSeries[i] ?? 0 }));

    const wau: { week: string; users: number }[] = [];
    for (let i = 0; i < daily.length; i += 7) {
      const slice = daily.slice(i, i + 7);
      wau.push({ week: slice[0]?.date ?? "", users: Math.max(...slice.map(d => d.users)) });
    }

    const sum = (series: number[]) => series.reduce((a, b) => a + b, 0);

    const lastActive = [...daily].reverse().find(d => d.users > 0) ?? null;
    const sessions30d = sum(sessionData.data?.series?.[0] || []);
    const features = FEATURES.map((f, i) => {
      const count = sum(featureData[i].data?.series?.[0] || []);
      return { name: f.name, count, used: count > 0 };
    });

    return NextResponse.json({
      daily,
      wau,
      max_dau: daily.length > 0 ? Math.max(...daily.map(d => d.users)) : 0,
      active_days_30d: daily.filter(d => d.users > 0).length,
      last_active_date: lastActive?.date ?? null,
      sessions_30d: sessions30d,
      features,
      is_filtered: !!accountProp,
    });
  } catch (err: any) {
    const msg = err?.message || "Failed to fetch Amplitude data";
    const isAmpError = msg.startsWith("4") || msg.startsWith("5");
    return NextResponse.json(
      { error: isAmpError ? `Amplitude API error: ${msg.split(":")[0]}` : "Failed to fetch Amplitude data", detail: msg },
      { status: 500 }
    );
  }
}
