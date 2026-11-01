import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api/errors";

export type LimitOpt = { name: string; max: number; windowSec: number };

/** Best-effort client address. Behind a proxy or CDN this is the first hop of X-Forwarded-For, so only trust it when your edge sets that header. */
export function clientIp(req: Request) {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0].trim() : req.headers.get("x-real-ip")) || "unknown";
}

/**
 * Counts this call in a fixed window shared by all instances (one atomic upsert) and throws 429 once `max` is passed.
 * If the database is unreachable the call is allowed, so a limiter outage never takes the API down.
 */
export async function rateLimit(opt: LimitOpt, subject: string) {
  // Only for automated tests on a non-production server; ignored when NODE_ENV is production.
  if (process.env.RATE_LIMIT_DISABLED === "true" && process.env.NODE_ENV !== "production") return;
  const windowStart = Math.floor(Date.now() / 1000 / opt.windowSec) * opt.windowSec;
  let count = 0;
  try {
    const rows = await db.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimitBucket" (key, "windowStart", count) VALUES (${`${opt.name}:${subject}`}, ${windowStart}, 1)
      ON CONFLICT (key, "windowStart") DO UPDATE SET count = "RateLimitBucket".count + 1
      RETURNING count`;
    count = rows[0]?.count ?? 0;
  } catch (e) {
    console.error(JSON.stringify({ level: "warn", msg: "rate limiter unavailable, allowing request", name: opt.name, error: (e as Error).message }));
    return;
  }
  if (Math.random() < 0.01) void cleanup(); // old windows are useless; sweep occasionally
  if (count > opt.max) {
    const retryAfter = windowStart + opt.windowSec - Math.floor(Date.now() / 1000);
    throw new ApiError(429, "RATE_LIMITED", `Too many requests. Try again in ${Math.max(1, retryAfter)} seconds`, { retryAfter: Math.max(1, retryAfter) });
  }
}

export const cleanup = () => db.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "createdAt" < now() - interval '2 days'`.catch(() => 0);

/** Convenience for handlers: limit per signed-in subject or, for public routes, per IP. */
export const limitBy = (req: NextRequest, opt: LimitOpt, subject?: string) => rateLimit(opt, subject ?? `ip:${clientIp(req)}`);
