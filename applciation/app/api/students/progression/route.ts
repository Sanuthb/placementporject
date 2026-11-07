import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError, badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { departmentScope } from "@/lib/auth/session";

const MAX = 5000;
const body = z.object({
  batchId: z.uuid(),
  /** Students currently in this semester. Null or left out means students with no semester set yet. */
  fromSemesterId: z.uuid().nullable().optional(),
  toSemesterId: z.uuid(),
  /** Students to leave behind, for example those repeating the semester. */
  excludeIds: z.array(z.uuid()).max(MAX).default([]),
  note: z.string().trim().max(500).optional(),
});

/** Moves a whole group of a batch to its next semester in one step. The batch does not change. */
export const POST = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (req, s) => {
  const b = await parseBody(req, body);
  const [batch, to, from] = await Promise.all([
    db.batch.findFirst({ where: { id: b.batchId, collegeId: s.collegeId }, select: { id: true, name: true } }),
    db.semester.findFirst({ where: { id: b.toSemesterId, collegeId: s.collegeId, batchId: b.batchId } }),
    b.fromSemesterId ? db.semester.findFirst({ where: { id: b.fromSemesterId, collegeId: s.collegeId, batchId: b.batchId } }) : Promise.resolve(null),
  ]);
  if (!batch) throw badRequest("Batch not found");
  if (!to) throw badRequest("The target semester does not belong to this batch");
  if (b.fromSemesterId && !from) throw badRequest("The starting semester does not belong to this batch");
  if (from && to.number <= from.number) throw badRequest("Promotion moves forward. To repeat a semester, record it on the student");

  const students = await db.student.findMany({
    where: { collegeId: s.collegeId, ...departmentScope(s), batchId: b.batchId, isActive: true, isArchived: false, currentSemesterId: from?.id ?? null, id: { notIn: b.excludeIds } },
    select: { id: true }, take: MAX + 1,
  });
  if (!students.length) throw new ApiError(409, "CONFLICT", "No students match. They may already have moved");
  if (students.length > MAX) throw badRequest(`That is more than ${MAX} students at once. Promote them in smaller groups`);
  const ids = students.map((x) => x.id);

  await db.$transaction(async (tx) => {
    // The "where" repeats the starting point so a student who moved in the meantime is left alone.
    const moved = await tx.student.updateMany({
      where: { id: { in: ids }, collegeId: s.collegeId, currentSemesterId: from?.id ?? null },
      data: { currentSemesterId: to.id, ...(to.academicYearId ? { currentAcademicYearId: to.academicYearId } : {}) },
    });
    if (moved.count !== ids.length) throw new ApiError(409, "CONFLICT", "Some students changed while promoting. Nothing was moved; try again");
    await tx.studentProgression.createMany({
      data: ids.map((studentId) => ({ collegeId: s.collegeId, studentId, semesterId: to.id, academicYearId: to.academicYearId, kind: "PROMOTED" as const, note: b.note ?? null, createdById: s.userId })),
    });
    await audit(s, { action: "student.progression.promote_group", entity: "Batch", entityId: batch.id, after: { batch: batch.name, from: from?.name ?? "not set", to: to.name, students: ids.length, left: b.excludeIds.length } }, tx);
  });
  return { promoted: ids.length, batch: batch.name, to: to.name };
});
