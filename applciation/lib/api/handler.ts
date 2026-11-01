import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { ApiError } from "@/lib/api/errors";
import { getSession, requireModule, requireRole, type Session } from "@/lib/auth/session";
import type { ModuleKey, Role } from "@/generated/prisma/client";
import { rateLimit, type LimitOpt } from "@/lib/rateLimit";

type Opts = { roles?: Role[]; module?: ModuleKey; limit?: LimitOpt };
type Ctx<P> = { params: Promise<P> };

/** Wraps a route handler: authenticates, checks role and module, and maps errors to JSON. */
export function route<P = Record<string, string>>(
  opts: Opts,
  fn: (req: NextRequest, session: Session, params: P) => Promise<Response | object>,
) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    try {
      const session = await getSession(req);
      if (opts.roles) requireRole(session, ...opts.roles);
      if (opts.module) await requireModule(session, opts.module);
      if (opts.limit) await rateLimit(opts.limit, session.userId);
      const result = await fn(req, session, await ctx.params);
      return result instanceof Response ? result : NextResponse.json({ data: result });
    } catch (e) {
      return toErrorResponse(e, req);
    }
  };
}

/** Maps any thrown error to the JSON error shape used across the API. Every error carries the request id so a report can be traced in the logs. */
export function toErrorResponse(e: unknown, req?: Request) {
  const requestId = req?.headers.get("x-request-id") ?? undefined;
  if (e instanceof ApiError) {
    const retry = (e.details as { retryAfter?: number } | undefined)?.retryAfter;
    return NextResponse.json({ error: { code: e.code, message: e.message, details: e.details, requestId } }, { status: e.status, headers: retry ? { "retry-after": String(retry) } : undefined });
  }
  if (e instanceof ZodError) return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid input", details: e.issues, requestId } }, { status: 400 });
  console.error(JSON.stringify({ level: "error", requestId, path: req ? new URL(req.url).pathname : undefined, method: req?.method, message: (e as Error)?.message, stack: (e as Error)?.stack }));
  return NextResponse.json({ error: { code: "INTERNAL", message: "Something went wrong", requestId } }, { status: 500 });
}
