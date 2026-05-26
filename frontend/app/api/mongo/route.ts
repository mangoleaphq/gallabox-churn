import { NextRequest, NextResponse } from "next/server";
import { MongoClient, ObjectId } from "mongodb";

const MONGO_URI = process.env.MONGO_URI || "";

let client: MongoClient | null = null;

async function getClient() {
  if (!client) {
    client = new MongoClient(MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 60000,
    });
    await client.connect();
  }
  return client;
}

async function resetClient() {
  if (client) {
    try { await client.close(); } catch { /* ignore */ }
    client = null;
  }
}

function toObjectId(id: string): ObjectId | null {
  try { return new ObjectId(id); } catch { return null; }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, accountIds, accountId } = body;

  try {
    const mongo = await getClient();
    const db = mongo.db("gbProdDB");

    // ── Botflow use-case analysis per account ──────────────────────────────────
    if (action === "botflow_analysis" && Array.isArray(accountIds)) {
      const oids = accountIds.map((id: string) => toObjectId(id)).filter(Boolean) as ObjectId[];
      if (oids.length === 0) return NextResponse.json({ results: {} });

      const botflows = await db
        .collection("botflowbuilders")
        .find({ accountId: { $in: oids } })
        .project({ accountId: 1, name: 1, type: 1, intents: 1, elements: 1, isNonPublishable: 1, createdAt: 1, _id: 0 })
        .toArray();

      const INTENT_USE_CASE: Record<string, string> = {
        "welcome": "Welcome / Greeting", "hi": "Welcome / Greeting",
        "hello": "Welcome / Greeting", "hey": "Welcome / Greeting",
        "menu": "Menu / Navigation",
        "order": "Order / Shipping", "track": "Order / Shipping",
        "shipping": "Order / Shipping", "delivery": "Order / Shipping",
        "product": "Product Inquiry", "price": "Product Inquiry",
        "cost": "Product Inquiry", "feature": "Product Inquiry", "catalog": "Product Inquiry",
        "interested": "Lead Qualification", "buy": "Lead Qualification",
        "purchase": "Lead Qualification", "demo": "Lead Qualification",
        "quote": "Lead Qualification", "enquiry": "Lead Qualification",
        "feedback": "Feedback / CSAT", "rating": "Feedback / CSAT",
        "review": "Feedback / CSAT", "survey": "Feedback / CSAT",
        "support": "Customer Support", "complaint": "Customer Support",
        "issue": "Customer Support", "problem": "Customer Support",
        "not working": "Customer Support", "refund": "Customer Support",
        "return": "Customer Support", "cancel": "Customer Support",
        "book": "Appointment / Booking", "schedule": "Appointment / Booking",
        "appointment": "Appointment / Booking", "slot": "Appointment / Booking",
        "faq": "FAQ", "how": "FAQ", "what": "FAQ", "when": "FAQ", "why": "FAQ",
        "human": "Human Handoff", "agent": "Human Handoff",
        "live chat": "Human Handoff", "talk to": "Human Handoff",
        "connect": "Human Handoff", "escalate": "Human Handoff",
        "broadcast": "Broadcast / Campaigns", "campaign": "Broadcast / Campaigns",
        "promotion": "Broadcast / Campaigns", "offer": "Broadcast / Campaigns",
        "discount": "Broadcast / Campaigns",
      };

      const BLOCK_USE_CASE: Record<string, string> = {
        "create_ticket": "Customer Support",
        "resolve_conversation": "Customer Support",
        "close_conversation": "Customer Support",
        "google_sheet_integration": "Data Capture / Logging",
        "shopify_integration": "eCommerce / Orders",
        "razorpay_integration": "Payments / Billing",
        "http_request": "API / Notifications",
        "send_sms": "Notifications / Alerts",
        "send_email": "Notifications / Alerts",
        "whatsapp_template": "Notifications / Alerts",
        "set_variable": "Data Collection",
        "broadcast_message": "Broadcast / Campaigns",
        "subscribe": "Opt-in / Subscriptions",
        "unsubscribe": "Opt-out / Unsubscribes",
      };

      type BFResult = {
        accountId: string;
        total: number;
        useCases: Record<string, number>;
        names: string[];
      };

      const results: Record<string, BFResult> = {};

      for (const bf of botflows) {
        const aid = String(bf.accountId);
        if (!results[aid]) results[aid] = { accountId: aid, total: 0, useCases: {}, names: [] };
        results[aid].total++;
        if (bf.name) results[aid].names.push(bf.name);

        const blockTypes: string[] = [];
        const intentTexts: string[] = [];
        const textSnippets: string[] = [];

        for (const el of (bf.elements || [])) {
          if (el && typeof el === "object") {
            const dt = (el as any).data?.type;
            if (dt) blockTypes.push(dt);
            const txt = (el as any).data?.text;
            if (dt === "send_text" && txt) textSnippets.push(String(txt).slice(0, 100).toLowerCase());
          }
        }
        for (const intent of (bf.intents || [])) {
          if (intent && typeof intent === "object") {
            const t = (intent as any).text;
            if (t) intentTexts.push(String(t).toLowerCase());
          }
        }

        const allText = `${bf.name || ""} ${intentTexts.join(" ")} ${textSnippets.join(" ")}`.toLowerCase();

        const scores: Record<string, number> = {};
        for (const [kw, uc] of Object.entries(INTENT_USE_CASE)) {
          if (allText.includes(kw)) scores[uc] = (scores[uc] || 0) + 1;
        }
        for (const [block, uc] of Object.entries(BLOCK_USE_CASE)) {
          if (blockTypes.includes(block)) scores[uc] = (scores[uc] || 0) + 2;
        }

        let useCase = "General";
        if (blockTypes.includes("shopify_integration")) useCase = "eCommerce / Orders";
        else if (blockTypes.includes("razorpay_integration")) useCase = "Payments / Billing";
        else if (blockTypes.includes("google_sheet_integration") && textSnippets.some(t => t.includes("feedback") || t.includes("rating") || t.includes("survey"))) useCase = "Feedback / CSAT";
        else if (blockTypes.includes("google_sheet_integration")) useCase = "Data Capture / Logging";
        else if (blockTypes.includes("create_ticket") || blockTypes.includes("resolve_conversation")) useCase = "Customer Support";
        else {
          let maxScore = 0;
          for (const [uc, score] of Object.entries(scores)) {
            if (score > maxScore) { maxScore = score; useCase = uc; }
          }
        }

        results[aid].useCases[useCase] = (results[aid].useCases[useCase] || 0) + 1;
      }

      return NextResponse.json({ results: JSON.parse(JSON.stringify(results)) });
    }

    // ── Botflow session counts (single account) ────────────────────────────────
    if (action === "botflow_sessions" && accountId) {
      const oid = toObjectId(accountId);
      if (!oid) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

      const [sessions, completed] = await Promise.all([
        db.collection("botconversations").countDocuments({ accountId: oid }, { maxTimeMS: 10000 }),
        db.collection("botconversations").countDocuments({ accountId: oid, status: "completed" }, { maxTimeMS: 10000 }),
      ]);
      return NextResponse.json({ sessions, completed });
    }

    // ── Instagram channels + comment automations (single account) ─────────────
    if (action === "instagram_data" && accountId) {
      const oid = toObjectId(accountId);
      if (!oid) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

      const igChannels = await db
        .collection("channels")
        .find({ accountId: oid, channelType: "instagram", isDeleted: { $ne: true } })
        .project({ _id: 1, name: 1, createdAt: 1 })
        .toArray();

      if (igChannels.length === 0) return NextResponse.json({ channels: [], automations: [], commentCount: 0 });

      const automations = await db
        .collection("socialcommentautomations")
        .find({ accountId: oid, isDelete: { $ne: true } })
        .project({ name: 1, status: 1, automationType: 1, createdAt: 1, _id: 0 })
        .toArray();

      const commentAgg = await db
        .collection("socialcomments")
        .aggregate([
          { $match: { accountId: oid } },
          { $count: "total" },
        ])
        .toArray();

      return NextResponse.json({
        channels: JSON.parse(JSON.stringify(igChannels)),
        automations: JSON.parse(JSON.stringify(automations)),
        commentCount: commentAgg[0]?.total || 0,
      });
    }

    // ── Subscription info (single account) ────────────────────────────────────
    if (action === "subscription" && accountId) {
      const oid = toObjectId(accountId);
      if (!oid) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

      const sub = await db
        .collection("subscriptions")
        .findOne({ accountId: oid }, { projection: { status: 1, isTrial: 1, planId: 1, expiresAt: 1, _id: 0 } });

      return NextResponse.json({ subscription: JSON.parse(JSON.stringify(sub || {})) });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  } catch (err: any) {
    if (err.message?.includes("timeout") || err.message?.includes("closed") || err.message?.includes("topology")) {
      await resetClient();
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
