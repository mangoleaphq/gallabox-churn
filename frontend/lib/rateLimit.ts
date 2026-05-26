/**
 * Simple in-memory rate limiter for Next.js API routes.
 * Limits each IP to `max` requests per `windowMs` milliseconds.
 * Note: resets on server restart — suitable for internal tools.
 */

interface Entry { count: number; resetAt: number }
const store = new Map<string, Entry>();

export function rateLimit(ip: string, max = 60, windowMs = 60_000): { ok: boolean; remaining: number } {
  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || now > entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: max - 1 };
  }

  entry.count++;
  if (entry.count > max) {
    return { ok: false, remaining: 0 };
  }
  return { ok: true, remaining: max - entry.count };
}

export function getIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}
