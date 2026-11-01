import type { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth/verifyToken";
import { db } from "@/lib/db";
import { forbidden, unauthorized } from "@/lib/api/errors";

export type RecruiterSession = { recruiterId: string; collegeId: string; companyId: string; name: string; email: string };

/** Verifies the Supabase JWT and loads the recruiter it belongs to. Inactive recruiters, companies and colleges are refused. */
export async function getRecruiterSession(req: NextRequest): Promise<RecruiterSession> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw unauthorized();
  const authId = await verifyToken(token);
  const r = await db.recruiter.findUnique({ where: { id: authId }, include: { company: { select: { isActive: true } }, } });
  if (!r || !r.isActive || !r.company.isActive || !(await db.college.findFirst({ where: { id: r.collegeId, isActive: true }, select: { id: true } }))) throw forbidden("This is not an active recruiter account");
  return { recruiterId: r.id, collegeId: r.collegeId, companyId: r.companyId, name: r.name, email: r.email };
}
