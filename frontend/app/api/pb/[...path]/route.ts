import { NextRequest, NextResponse } from "next/server";

const PB_BASE     = process.env.PB_BASE     || "http://127.0.0.1:8090";
const PB_EMAIL    = process.env.PB_EMAIL    || "";
const PB_PASSWORD = process.env.PB_PASSWORD || "";

let _token: string | null = null;

async function getToken(): Promise<string> {
  if (_token) return _token;
  const res = await fetch(`${PB_BASE}/api/collections/_superusers/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: PB_EMAIL, password: PB_PASSWORD }),
  });
  const json = await res.json();
  if (!json.token) throw new Error("PocketBase auth failed");
  _token = json.token;
  return _token!;
}

async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const url = `${PB_BASE}/api/${path.join("/")}${req.nextUrl.search}`;
  const body = req.method !== "GET" ? await req.text() : undefined;

  let token = await getToken();
  let res = await fetch(url, {
    method: req.method,
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body,
  });

  // Token expired — re-auth once and retry
  if (res.status === 401) {
    _token = null;
    token = await getToken();
    res = await fetch(url, {
      method: req.method,
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body,
    });
  }

  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path);
}
