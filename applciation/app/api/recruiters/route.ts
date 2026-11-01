import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError, badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { supabaseAdmin } from "@/lib/supabase-admin";

const create = z.object({ companyId: z.uuid(), email: z.email().transform((e) => e.toLowerCase()), name: z.string().trim().min(2).max(120) });

export const GET = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "RECRUITER_PORTAL" }, (_req, s) => db.recruiter.findMany({ where: { collegeId: s.collegeId }, include: { company: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 300 }));

/** Invites a recruiter by email. They only ever see their own company's drives. */
export const POST = route({ limit: { name: "invite", max: 30, windowSec: 3600 }, roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "RECRUITER_PORTAL" }, async (req, s) => {
  const b = await parseBody(req, create);
  if (!(await db.company.findFirst({ where: { id: b.companyId, collegeId: s.collegeId, isActive: true } }))) throw badRequest("Company not found or inactive");
  if (await db.recruiter.findUnique({ where: { collegeId_email: { collegeId: s.collegeId, email: b.email } } })) throw new ApiError(409, "CONFLICT", "A recruiter with this email already exists");
  const { data, error } = await supabaseAdmin().auth.admin.inviteUserByEmail(b.email, { redirectTo: process.env.APP_URL ? `${process.env.APP_URL}/auth/accept-invite` : undefined });
  if (error || !data.user) throw badRequest(error?.message ?? "Could not send the invitation");
  try {
    return await db.$transaction(async (tx) => {
      const r = await tx.recruiter.create({ data: { id: data.user.id, collegeId: s.collegeId, ...b } });
      await audit(s, { action: "recruiter.invite", entity: "Recruiter", entityId: r.id, after: { email: r.email, companyId: r.companyId } }, tx);
      return { id: r.id, email: r.email, name: r.name, companyId: r.companyId };
    });
  } catch (e) { await supabaseAdmin().auth.admin.deleteUser(data.user.id); throw e; }
});
