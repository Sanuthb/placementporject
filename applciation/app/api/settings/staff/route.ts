import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError, badRequest } from "@/lib/api/errors";
import { assertDepartment } from "@/lib/api/guards";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { Role } from "@/generated/prisma/client";

const invite = z
  .object({ email: z.email().transform((e) => e.toLowerCase()), name: z.string().trim().min(2).max(120), role: z.enum(Role), departmentId: z.uuid().nullable().optional() })
  .refine((v) => (v.role === "DEPARTMENT_COORDINATOR") === !!v.departmentId, {
    message: "A department is required for coordinators and not allowed for other roles",
    path: ["departmentId"],
  });

export const GET = route({ roles: ["TPO_ADMIN"] }, (_req, s) =>
  db.user.findMany({
    where: { collegeId: s.collegeId },
    select: { id: true, email: true, name: true, role: true, departmentId: true, isActive: true, createdAt: true },
    orderBy: { name: "asc" },
  }),
);

export const POST = route({ limit: { name: "invite", max: 30, windowSec: 3600 }, roles: ["TPO_ADMIN"] }, async (req, s) => {
  const data = await parseBody(req, invite);
  if (data.departmentId) await assertDepartment(s.collegeId, data.departmentId);
  if (await db.user.findUnique({ where: { collegeId_email: { collegeId: s.collegeId, email: data.email } } }))
    throw new ApiError(409, "CONFLICT", "A staff member with this email already exists");

  const { data: invited, error } = await supabaseAdmin().auth.admin.inviteUserByEmail(data.email, {
    redirectTo: process.env.APP_URL ? `${process.env.APP_URL}/auth/accept-invite` : undefined,
  });
  if (error || !invited.user) throw badRequest(error?.message ?? "Could not send the invitation");

  try {
    return await db.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { id: invited.user.id, collegeId: s.collegeId, email: data.email, name: data.name, role: data.role, departmentId: data.departmentId ?? null },
        select: { id: true, email: true, name: true, role: true, departmentId: true, isActive: true },
      });
      await audit(s, { action: "staff.invite", entity: "User", entityId: u.id, after: { email: u.email, role: u.role, departmentId: u.departmentId } }, tx);
      return u;
    });
  } catch (e) {
    // Don't leave an orphaned auth user behind if the app record could not be saved.
    await supabaseAdmin().auth.admin.deleteUser(invited.user.id);
    throw e;
  }
});
