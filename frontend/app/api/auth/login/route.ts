import { NextRequest, NextResponse } from "next/server";

const PB = process.env.PB_BASE || "http://127.0.0.1:8090";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  const pbRes = await fetch(`${PB}/api/collections/users/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: email, password }),
  }).catch(() => null);

  if (!pbRes || !pbRes.ok) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const data = await pbRes.json();
  const token: string = data.token;
  const user = data.record;

  const res = NextResponse.json({ name: user.name || user.email });
  res.cookies.set("pb_auth", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14, // 14 days
  });
  return res;
}
