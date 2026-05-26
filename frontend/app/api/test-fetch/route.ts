import { NextResponse } from "next/server";

export async function GET(): Promise<Response> {
  try {
    const https = require("https");
    const chUrl = new URL(process.env.CH_HOST || "https://localhost:8443");
    const chUser = process.env.CH_USER || "default";
    const chPass = process.env.CH_PASS || "";
    const creds = Buffer.from(`${chUser}:${chPass}`).toString("base64");
    const body = `SELECT toStartOfMonth(createdAt) as month, COUNT() as total_conversations, countIf(resolvedAt IS NOT NULL) as resolved_conversations, round(countIf(resolvedAt IS NOT NULL)/COUNT()*100,1) as resolution_rate_pct, countIf(channelType='whatsapp') as whatsapp_convos, countIf(channelType='web') as web_convos, countIf(channelType='instagram') as instagram_convos, uniqExact(accountId) as active_accounts, uniqExact(assigneeId) as active_agents, uniqExact(botId) as active_bots, round(avgIf(firstRespondedInMilliSeconds, firstRespondedAt IS NOT NULL AND firstRespondedInMilliSeconds < 604800000)/1000/60,1) as avg_frt_mins, round(avgIf(timeToResolveInMilliSeconds, resolvedAt IS NOT NULL AND timeToResolveInMilliSeconds < 604800000)/1000/60,0) as avg_ttr_mins, COUNTIf(botId != '') as bot_conversations, uniqExactIf(accountId, botId != '') as accounts_using_bots FROM default.conversations WHERE createdAt >= '2025-01-01' GROUP BY month ORDER BY month ASC FORMAT JSONCompact` + "\n";

    return new Promise((resolve) => {
      const req = https.request(
        {
          hostname: chUrl.hostname,
          port: parseInt(chUrl.port) || 8443,
          path: "/",
          method: "POST",
          headers: {
            "Content-Type": "text/plain",
            Authorization: `Basic ${creds}`,
            "Content-Length": Buffer.byteLength(body),
          },
          timeout: 120000,
        },
        (res: any) => {
          let data = "";
          res.on("data", (c: any) => (data += c.toString()));
          res.on("end", () =>
            resolve(NextResponse.json({ ok: res.ok, status: res.statusCode, data: data.slice(0, 500) }))
          );
        }
      );
      req.on("error", (e: any) => resolve(NextResponse.json({ ok: false, error: e.message })));
      req.on("timeout", () => { req.destroy(); resolve(NextResponse.json({ ok: false, error: "timeout" })); });
      req.write(body);
      req.end();
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message });
  }
}
