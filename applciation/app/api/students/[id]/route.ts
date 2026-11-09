import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError, badRequest, notFound } from "@/lib/api/errors";
import { departmentScope } from "@/lib/auth/session";
import { setLoginBlocked } from "@/lib/supabase-admin";
import { studentSelect } from "@/lib/students";
import { resolveMapping } from "@/lib/academicMapping";

const patch = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  enrollmentNo: z.string().trim().min(1).max(50).optional(),
  email: z.email().transform((e) => e.toLowerCase()).optional(),
  campusId: z.uuid().nullable().optional(),
  admissionYear: z.number().int().min(1990).max(2100).optional(),
  graduationYear: z.number().int().min(1990).max(2100).optional(),
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

  const { semesterId, academicYearId, graduationYear, ...fields } = data;
  // The login belongs to the email it was created with, so the email is only editable while the student has not accepted.
  if (data.email && data.email !== before.email && before.userId) throw badRequest("The email cannot be changed after the student has accepted the invitation");
  if (data.enrollmentNo || data.email) {
    const clash = await db.student.findFirst({ where: { collegeId: s.collegeId, id: { not: id }, OR: [...(data.enrollmentNo ? [{ enrollmentNo: { equals: data.enrollmentNo, mode: "insensitive" as const } }] : []), ...(data.email ? [{ email: data.email }] : [])] }, select: { id: true } });
    if (clash) throw new ApiError(409, "CONFLICT", "Another student already has this admission number or email");
  }
  if (data.campusId && !(await db.campus.findFirst({ where: { id: data.campusId, collegeId: s.collegeId }, select: { id: true } }))) throw badRequest("Campus not found");
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
    // Keep the invitation's copy of the assigned details in step, so the email and acceptance page show what staff see.
    const inv = await tx.studentInvitation.findUnique({ where: { studentId: id }, select: { id: true, status: true } });
    if (inv) {
      await tx.studentInvitation.update({
        where: { id: inv.id },
        data: {
          admissionNumber: a.enrollmentNo, ...(inv.status !== "ACCEPTED" ? { invitedEmail: a.email } : {}), campusId: a.campusId, departmentId: a.departmentId, programId: a.programId, branchId: a.branchId, batchId: a.batchId,
          admissionYear: a.admissionYear, ...(graduationYear !== undefined ? { graduationYear } : {}),
        },
      });
    }
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
