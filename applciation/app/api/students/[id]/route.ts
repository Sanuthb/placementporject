import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { departmentScope } from "@/lib/auth/session";
import { setLoginBlocked } from "@/lib/supabase-admin";
import { studentSelect } from "@/lib/students";
import { resolveMapping } from "@/lib/academicMapping";

const patch = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().regex(/^\+?[\d\s-]{7,16}$/).nullable().optional(),
  departmentId: z.uuid().optional(),
  batchId: z.uuid().optional(),
  programId: z.uuid().nullable().optional(),
  branchId: z.uuid().nullable().optional(),
  semesterId: z.uuid().nullable().optional(),
  academicYearId: z.uuid().nullable().optional(),
  dateOfBirth: z.coerce.date().max(new Date()).nullable().optional(),
  gender: z.string().trim().max(30).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
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

  const { semesterId, academicYearId, ...fields } = data;
  const mapKeys = ["departmentId", "batchId", "programId", "branchId"] as const;
  const remaps = mapKeys.some((k) => k in data) || semesterId !== undefined || academicYearId !== undefined;
  const batchChanged = !!data.batchId && data.batchId !== before.batchId;

  const after = await db.$transaction(async (tx) => {
    let mapped: Record<string, unknown> = {};
    if (remaps) {
      // A new batch means a different programme and semester list, so what depended on the old batch is cleared unless given again.
      const m = await resolveMapping(tx, s.collegeId, {
        departmentId: data.departmentId ?? before.departmentId,
        batchId: data.batchId ?? before.batchId,
        programId: data.programId !== undefined ? data.programId : batchChanged ? null : before.programId,
        branchId: data.branchId !== undefined ? data.branchId : batchChanged ? null : before.branchId,
        semesterId: semesterId !== undefined ? semesterId : batchChanged ? null : before.currentSemesterId,
        academicYearId: academicYearId !== undefined ? academicYearId : batchChanged ? null : before.currentAcademicYearId,
      });
      mapped = m;
      if (m.currentSemesterId !== before.currentSemesterId)
        await tx.studentProgression.create({ data: { collegeId: s.collegeId, studentId: id, semesterId: m.currentSemesterId, academicYearId: m.currentAcademicYearId, kind: "PROMOTED", note: batchChanged ? "Moved to a different batch" : null, createdById: s.userId } });
    }
    const a = await tx.student.update({ where: { id }, data: { ...fields, ...mapped }, select: studentSelect });
    const action = data.isActive === false ? "student.deactivate" : data.isActive === true && !before.isActive ? "student.reactivate" : "student.update";
    await audit(s, { action, entity: "Student", entityId: id, before: { name: before.name, departmentId: before.departmentId, batchId: before.batchId, programId: before.programId, isActive: before.isActive, isArchived: before.isArchived }, after: { ...fields, ...mapped } as object }, tx);
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
