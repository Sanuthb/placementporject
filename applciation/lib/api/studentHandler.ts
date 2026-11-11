import { runWithAiContext } from "@/lib/ai/context";
import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/api/handler";
import { requireModule } from "@/lib/auth/session";
import { getStudentSession, type StudentSession } from "@/lib/auth/student";
import type { ModuleKey } from "@/generated/prisma/client";
import { rateLimit, type LimitOpt } from "@/lib/rateLimit";

/** Like `route`, for the student app: authenticates a student and optionally requires a module the college has bought. */
export function studentRoute<P = Record<string, string>>(
  opts: { module?: ModuleKey; limit?: LimitOpt },
  fn: (req: NextRequest, me: StudentSession, params: P) => Promise<Response | object>,
) {
  return async (req: NextRequest, ctx: { params: Promise<P> }) => {
    try {
      const me = await getStudentSession(req);
      if (opts.module) await requireModule(me, opts.module);
      if (opts.limit) await rateLimit(opts.limit, me.studentId);
      const params = await ctx.params;
      const result = await runWithAiContext(me.collegeId, () => fn(req, me, params)); // AI calls made inside count for this institution
      return result instanceof Response ? result : NextResponse.json({ data: result });
    } catch (e) {
      return toErrorResponse(e, req);
    }
  };
}
