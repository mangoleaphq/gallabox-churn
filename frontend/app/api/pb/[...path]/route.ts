import { NextRequest, NextResponse } from "next/server";
import { pbFetch } from "@/lib/pb";

async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const url  = `/api/${path.join("/")}${req.nextUrl.search}`;
  const body = req.method !== "GET" ? await req.text() : undefined;
  const res  = await pbFetch(url, { method: req.method, body });
  const data = await res.text();
  return new NextResponse(data, { status: res.status, headers: { "Content-Type": "application/json" } });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params; return proxy(req, path);
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params; return proxy(req, path);
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params; return proxy(req, path);
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params; return proxy(req, path);
}
