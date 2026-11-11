import { runWithAiContext } from "@/lib/ai/context";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { ApiError, forbidden } from "@/lib/api/errors";
import { getSession, isFacultyOnly, isPrincipalOnly, requireModule, requireRole, type Session } from "@/lib/auth/session";
import type { ModuleKey, Role } from "@/generated/prisma/client";
import { rateLimit, type LimitOpt } from "@/lib/rateLimit";
import { recordError, safeFailure } from "@/lib/monitorStore";
import { isDatabaseUnavailable } from "@/lib/dbErrors";

type Opts = { roles?: Role[]; /** Let a faculty-only session through without listing FACULTY in `roles` (read-only routes any staff member may use). */ facultyOk?: boolean; /** Lets a principal-only session through. Only for routes that are safe for a read-only viewer. */ principalOk?: boolean; module?: ModuleKey; limit?: LimitOpt; /** For the few routes a person must reach before finishing two-step sign-in. */ skipMfa?: boolean };
type Ctx<P> = { params: Promise<P> };

/** Wraps a route handler: authenticates, checks role and module, and maps errors to JSON. */
export function route<P = Record<string, string>>(
  opts: Opts,
  fn: (req: NextRequest, session: Session, params: P) => Promise<Response | object>,
) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    try {
      const session = await getSession(req, { skipMfa: opts.skipMfa });
      // Deny by default for faculty-only sessions: they reach a route only if it names FACULTY or sets facultyOk.
      if (isFacultyOnly(session) && !opts.facultyOk && !opts.roles?.includes("FACULTY")) throw forbidden();
      // Deny by default for principal-only sessions too: they reach a route only if it names PRINCIPAL or sets principalOk.
      if (isPrincipalOnly(session) && !opts.principalOk && !opts.roles?.includes("PRINCIPAL")) throw forbidden();
      if (opts.roles) requireRole(session, ...opts.roles);
      if (opts.module) await requireModule(session, opts.module);
      if (opts.limit) await rateLimit(opts.limit, session.userId);
      const params = await ctx.params;
      const result = await runWithAiContext(session.collegeId, () => fn(req, session, params)); // AI calls made inside count for this institution
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
    if (e.status >= 500) recordError({ status: e.status, code: e.code, message: e.message, method: req?.method ?? null, path: req ? new URL(req.url).pathname : null, requestId: requestId ?? null }); // monitoring memory: service failures only, sanitized there
    const retry = (e.details as { retryAfter?: number } | undefined)?.retryAfter;
    return NextResponse.json({ error: { code: e.code, message: e.message, details: e.details, requestId } }, { status: e.status, headers: retry ? { "retry-after": String(retry) } : undefined });
  }
  // The database cannot be reached: say so plainly (503, retry soon). Nothing about the failure is returned, and nothing is bypassed: the request was refused.
  if (isDatabaseUnavailable(e)) {
    recordError({ status: 503, code: "DATABASE_UNAVAILABLE", message: "database unreachable", service: "database", method: req?.method ?? null, path: req ? new URL(req.url).pathname : null, requestId: requestId ?? null });
    return NextResponse.json({ error: { code: "DATABASE_UNAVAILABLE", message: "The database is not reachable right now. Try again in a few seconds", requestId } }, { status: 503, headers: { "retry-after": "5" } });
  }
  if (e instanceof ZodError) return NextResponse.json({ error: { code: "VALIDATION", message: validationMessage(e), details: e.issues, requestId } }, { status: 400 });
  recordError({ status: 500, code: "INTERNAL", message: safeFailure(e), method: req?.method ?? null, path: req ? new URL(req.url).pathname : null, requestId: requestId ?? null });
  console.error(JSON.stringify({ level: "error", requestId, path: req ? new URL(req.url).pathname : undefined, method: req?.method, message: (e as Error)?.message, stack: (e as Error)?.stack }));
  return NextResponse.json({ error: { code: "INTERNAL", message: "Something went wrong", requestId } }, { status: 500 });
}

const FIELD_LABEL: Record<string, string> = { enrollmentNo: "Admission number", dateOfBirth: "Date of birth", departmentId: "Department", programId: "Programme", batchId: "Batch", branchId: "Branch", campusId: "Campus", admissionYear: "Admission year", graduationYear: "Graduation year" };
const humanize = (k: string) => FIELD_LABEL[k] ?? k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

/** A sentence a person can act on, such as "Password: Include a number", instead of a bare "Invalid input". Zod's own generic texts are replaced with plain ones. */
export function validationMessage(e: ZodError) {
  const parts = e.issues.slice(0, 3).map((i) => {
    const field = i.path.length ? humanize(String(i.path[i.path.length - 1])) : "";
    let msg = i.message;
    if (/^Invalid input: expected \w+, received undefined$/.test(msg)) msg = "is required";
    else if (/^Invalid input: expected/.test(msg) || msg === "Invalid input") msg = "is not valid";
    else if (/^Invalid email/i.test(msg)) msg = "must be a valid email address";
    else if (/^Invalid UUID/i.test(msg)) msg = "must be chosen from the list";
    else if (/^Too small: expected string to have >=1/.test(msg)) msg = "is required";
    else if (/^Too small: expected string to have >=(\d+)/.test(msg)) msg = `must be at least ${/>=(\d+)/.exec(msg)![1]} characters`;
    else if (/^Too big: expected string to have <=(\d+)/.test(msg)) msg = `must be at most ${/<=(\d+)/.exec(msg)![1]} characters`;
    else if (/^Invalid string: must match pattern/.test(msg)) msg = "is not in the expected format";
    return field ? (/^[A-Z]/.test(msg) ? `${field}: ${msg}` : `${field} ${msg}`) : msg;
  });
  return parts.join(". ") + (e.issues.length > 3 ? ` (and ${e.issues.length - 3} more)` : "");
}
