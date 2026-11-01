import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { departmentScope } from "@/lib/auth/session";
import { setLoginBlocked } from "@/lib/supabase-admin";
import { studentSelect } from "@/lib/students";

const patch = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().regex(/^\+?[\d\s-]{7,16}$/).nullable().optional(),
  departmentId: z.uuid().optional(),
  batchId: z.uuid().optional(),
  programId: z.uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

export const GET = route<{ id: string }>({ module: "ONBOARDING" }, async (_req, s, { id }) => {
  const st = await db.student.findFirst({ where: { id, collegeId: s.collegeId, ...departmentScope(s) }, select: studentSelect });
  if (!st) throw notFound("Student not found");
  return st;
});

export const PATCH = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (req, s, { id }) => {
  const data = await parseBody(req, patch);
  const before = await db.student.findFirst({ where: { id, collegeId: s.collegeId } });
  if (!before) throw notFound("Student not found");

  if (data.departmentId && !(await db.department.findFirst({ where: { id: data.departmentId, collegeId: s.collegeId, isActive: true } }))) throw badRequest("Department not found or inactive");
  if (data.batchId && !(await db.batch.findFirst({ where: { id: data.batchId, collegeId: s.collegeId, isActive: true } }))) throw badRequest("Batch not found or inactive");
  if (data.programId && !(await db.program.findFirst({ where: { id: data.programId, collegeId: s.collegeId, isActive: true } }))) throw badRequest("Program not found or inactive");

  const after = await db.$transaction(async (tx) => {
    const a = await tx.student.update({ where: { id }, data, select: studentSelect });
    const action = data.isActive === false ? "student.deactivate" : data.isActive === true && !before.isActive ? "student.reactivate" : "student.update";
    await audit(s, { action, entity: "Student", entityId: id, before: { name: before.name, departmentId: before.departmentId, batchId: before.batchId, isActive: before.isActive, isArchived: before.isArchived }, after: data }, tx);
    return a;
  });

  // Block or restore the student's login. Done after commit; failure is reported, not hidden.
  if (data.isActive !== undefined && data.isActive !== before.isActive && before.userId) {
    try {
      await setLoginBlocked(before.userId, !data.isActive);
    } catch {
      return { ...after, warning: "Student was updated but their login could not be blocked/unblocked in Supabase. Retry." };
    }
  }
  return after;
});
