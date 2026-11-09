import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError, badRequest } from "@/lib/api/errors";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { allocationFields, applyAllocations, facultySelect, isFacultyWhere, profileFields, shapeFaculty } from "@/lib/faculty";

const create = z.object({ email: z.email().transform((e) => e.toLowerCase()), name: z.string().trim().min(2).max(120) }).extend(profileFields.shape).extend(allocationFields.shape);

export const GET = route({ roles: ["TPO_ADMIN"] }, async (_req, s) =>
  (await db.user.findMany({ where: isFacultyWhere(s.collegeId), select: facultySelect, orderBy: { name: "asc" } })).map(shapeFaculty));

/** Invites a new staff account with the FACULTY role (same invitation flow as other staff) and creates the profile and allocations. */
export const POST = route({ limit: { name: "invite", max: 30, windowSec: 3600 }, roles: ["TPO_ADMIN"] }, async (req, s) => {
  const { email, name, departmentIds, programIds, batchIds, ...profile } = await parseBody(req, create);
  if (profile.employeeId && (await db.facultyProfile.findFirst({ where: { collegeId: s.collegeId, employeeId: profile.employeeId } }))) throw new ApiError(409, "CONFLICT", "That employee ID is already used");
  if (await db.user.findUnique({ where: { collegeId_email: { collegeId: s.collegeId, email } } })) throw new ApiError(409, "CONFLICT", "A staff member with this email already exists");

  const { data: invited, error } = await supabaseAdmin().auth.admin.inviteUserByEmail(email, { redirectTo: process.env.APP_URL ? `${process.env.APP_URL}/auth/accept-invite` : undefined });
  if (error || !invited.user) throw badRequest(error?.message ?? "Could not send the invitation");
  try {
    return await db.$transaction(async (tx) => {
      const u = await tx.user.create({ data: { id: invited.user.id, collegeId: s.collegeId, email, name, role: "FACULTY" }, select: { id: true } });
      await tx.facultyProfile.create({ data: { userId: u.id, collegeId: s.collegeId, ...profile } });
      const alloc = await applyAllocations(tx, s.collegeId, u.id, { departmentIds: departmentIds ?? [], programIds: programIds ?? [], batchIds: batchIds ?? [] });
      await audit(s, { action: "faculty.create", entity: "User", entityId: u.id, after: { email, name, ...profile, ...alloc } as object }, tx);
      return shapeFaculty(await tx.user.findUniqueOrThrow({ where: { id: u.id }, select: facultySelect }));
    });
  } catch (e) {
    await supabaseAdmin().auth.admin.deleteUser(invited.user.id); // no orphaned login if the records could not be saved
    throw e;
  }
});
