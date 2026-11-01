import { NextResponse, type NextRequest } from "next/server";

/**
 * Runs in front of every /api request: request id, CORS for the frontend, security headers, and a coarse per-IP flood guard.
 * The flood guard is in-memory (per server instance) and only a safety net; the real limits are the database-backed ones in lib/rateLimit.ts.
 */
const isProd = process.env.NODE_ENV === "production";
const allowed = new Set((process.env.CORS_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean));
const originAllowed = (o: string | null) => !!o && (allowed.has(o) || (!isProd && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)));

const FLOOD_MAX = Number(process.env.FLOOD_MAX_PER_MINUTE ?? 600);
const hits = new Map<string, { n: number; reset: number }>();
function flooded(ip: string) {
  const now = Date.now();
  if (hits.size > 20_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  const h = hits.get(ip);
  if (!h || h.reset < now) { hits.set(ip, { n: 1, reset: now + 60_000 }); return false; }
  return ++h.n > FLOOD_MAX;
}

export function proxy(req: NextRequest) {
  const origin = req.headers.get("origin");
  const requestId = req.headers.get("x-request-id")?.slice(0, 64) || crypto.randomUUID();
  const cors: Record<string, string> = originAllowed(origin)
    ? { "access-control-allow-origin": origin!, vary: "Origin", "access-control-allow-credentials": "false", "access-control-expose-headers": "x-request-id, retry-after, content-disposition" }
    : {};

  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: { ...cors, "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS", "access-control-allow-headers": "authorization,content-type,x-request-id", "access-control-max-age": "86400", "x-request-id": requestId } });
  }

  const ip = (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim();
  if (flooded(ip)) {
    return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Too many requests", requestId } }, { status: 429, headers: { ...cors, "retry-after": "30", "x-request-id": requestId } });
  }

  const headers = new Headers(req.headers);
  headers.set("x-request-id", requestId); // route handlers read this to tag errors
  const res = NextResponse.next({ request: { headers } });
  for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
  res.headers.set("x-request-id", requestId);
  res.headers.set("x-content-type-options", "nosniff");
  res.headers.set("x-frame-options", "DENY");
  res.headers.set("referrer-policy", "no-referrer");
  res.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  if (isProd) res.headers.set("strict-transport-security", "max-age=63072000; includeSubDomains");
  if (!res.headers.has("cache-control")) res.headers.set("cache-control", "no-store"); // API responses hold personal data: never cached by shared caches
  return res;
}

export const config = { matcher: "/api/:path*" };
