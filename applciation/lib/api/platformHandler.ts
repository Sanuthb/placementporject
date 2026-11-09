import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/api/handler";
import { getPlatformSession, type PlatformSession } from "@/lib/auth/platform";
import { rateLimit, type LimitOpt } from "@/lib/rateLimit";

/** Like `route`, for platform administrators. Never reachable with a college login. */
export function platformRoute<P = Record<string, string>>(
  opts: { limit?: LimitOpt },
  fn: (req: NextRequest, admin: PlatformSession, params: P) => Promise<Response | object>,
) {
  return async (req: NextRequest, ctx: { params: Promise<P> }) => {
    try {
      const admin = await getPlatformSession(req);
      if (opts.limit) await rateLimit(opts.limit, admin.adminId);
      const result = await fn(req, admin, await ctx.params);
      return result instanceof Response ? result : NextResponse.json({ data: result });
    } catch (e) {
      return toErrorResponse(e, req);
    }
  };
}
