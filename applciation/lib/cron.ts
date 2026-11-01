import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/** True when the request carries the scheduler secret. The same header also carries a signed-in admin's token, so a non-matching value is not an error: it falls through to normal login. */
export function isCronRequest(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  return !!secret && !!given && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}
