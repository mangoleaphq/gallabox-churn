import { NextRequest, NextResponse } from "next/server";
import { MongoClient, ObjectId } from "mongodb";
import { rateLimit, getIp } from "@/lib/rateLimit";

const MONGO_URI = process.env.MONGO_URI || "";

let client: MongoClient | null = null;

async function getClient() {
  if (!client) {
    client = new MongoClient(MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
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

export async function GET(req: NextRequest) {
  const { ok } = rateLimit(getIp(req), 60, 60_000);
  if (!ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const partnerId = new URL(req.url).searchParams.get("partner_id");
  if (!partnerId) {
    return NextResponse.json({ error: "partner_id required" }, { status: 400 });
  }

  try {
    const mongo = await getClient();
    const db = mongo.db("gbProdDB");

    let partnerOid: ObjectId;
    try {
      partnerOid = new ObjectId(partnerId);
    } catch {
      return NextResponse.json({ sub_accounts: [] });
    }

    // Get all sub-account IDs for this partner
    const links = await db
      .collection("partneraccounts")
      .find({ partnerId: partnerOid })
      .toArray();

    if (links.length === 0) {
      return NextResponse.json({ sub_accounts: [] });
    }

    const accountIds = links.map((l) => new ObjectId(l.accountId));

    // Fetch sub-account details from accounts collection
    const subAccounts = await db
      .collection("accounts")
      .find(
        { _id: { $in: accountIds } },
        { projection: { name: 1, status: 1, createdAt: 1, channelProvider: 1, partner: 1 } }
      )
      .toArray();

    return NextResponse.json({
      sub_accounts: subAccounts.map((a) => ({
        id: a._id.toString(),
        name: a.name || "Unknown",
        status: a.status || "unknown",
        channel_provider: a.channelProvider || "",
        created_at: a.createdAt,
      })),
    });
  } catch (err: any) {
    if (err.message?.includes("timeout") || err.message?.includes("closed") || err.message?.includes("topology")) {
      await resetClient();
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
