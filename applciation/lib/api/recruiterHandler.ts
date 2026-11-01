import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/api/handler";
import { requireModule } from "@/lib/auth/session";
import { getRecruiterSession, type RecruiterSession } from "@/lib/auth/recruiter";
import { db } from "@/lib/db";
import { notFound } from "@/lib/api/errors";

/** Like `route`, for company recruiters. The Recruiter portal module must be enabled for the college. */
export function recruiterRoute<P = Record<string, string>>(fn: (req: NextRequest, r: RecruiterSession, params: P) => Promise<Response | object>) {
  return async (req: NextRequest, ctx: { params: Promise<P> }) => {
    try {
      const r = await getRecruiterSession(req);
      await requireModule(r, "RECRUITER_PORTAL");
      const result = await fn(req, r, await ctx.params);
      return result instanceof Response ? result : NextResponse.json({ data: result });
    } catch (e) {
      return toErrorResponse(e, req);
    }
  };
}

/** A recruiter only ever reaches drives of their own company that are live or finished. */
export async function recruiterDrive(r: RecruiterSession, driveId: string) {
  const d = await db.drive.findFirst({ where: { id: driveId, collegeId: r.collegeId, companyId: r.companyId, status: { in: ["PUBLISHED", "CLOSED"] } } });
  if (!d) throw notFound("Drive not found");
  return d;
}
