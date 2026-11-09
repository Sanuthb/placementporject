import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { ApiError, badRequest, notFound } from "@/lib/api/errors";
import { audit } from "@/lib/audit";
import { educationInput } from "@/lib/api/academic";
import { semesterView, type SemesterInput, type SemRow } from "@/lib/academicRecords";

type Tx = Prisma.TransactionClient;
type Me = { collegeId: string; studentId: string };
export type EducationInput = z.infer<typeof educationInput>;

/**
 * The one way a student's qualification changes. A verified qualification is never overwritten in place: the change waits for staff approval.
 * Used by the student's own edit and by an accepted AI suggestion, so both obey exactly the same rules. The caller checks `assertEducationEditable`.
 */
export async function reviseEducationRecord(tx: Tx, me: Me, recordId: string, b: EducationInput, via?: string) {
  const row = await tx.studentEducationRecord.findFirst({ where: { id: recordId, studentId: me.studentId } });
  if (!row) throw notFound("Qualification not found");
  if (row.reviewStatus === "SUBMITTED") throw new ApiError(409, "CONFLICT", "This qualification is under review and cannot be changed right now");
  if (row.reviewStatus === "VERIFIED") await tx.studentEducationRecord.update({ where: { id: recordId }, data: { pendingData: b as Prisma.InputJsonObject } });
  else await tx.studentEducationRecord.update({ where: { id: recordId }, data: b });
  await audit({ collegeId: me.collegeId, userId: null }, { action: row.reviewStatus === "VERIFIED" ? "student.education.revise" : "student.education.update", entity: "Student", entityId: me.studentId, after: { recordId, level: b.level, ...(via ? { via } : {}) } }, tx);
  return tx.studentEducationRecord.findUniqueOrThrow({ where: { id: recordId } });
}

/**
 * The one way a student's semester result is added or changed. A verified semester is never overwritten in place: the change waits as a
 * pending revision until the ACADEMICS section is resubmitted and approved. The caller checks `assertSectionOpen`.
 */
export async function upsertSemester(tx: Tx, me: Me, b: SemesterInput, via?: string) {
  const st = await tx.student.findUniqueOrThrow({ where: { id: me.studentId }, select: { batchId: true, currentSemester: { select: { number: true } } } });
  if (st.currentSemester && b.semesterNumber > st.currentSemester.number) throw badRequest(`Semester ${b.semesterNumber} is after your current semester (${st.currentSemester.number})`);
  // The M2 semester of the student's own batch with this number, when the institution has set it up.
  const sem = await tx.semester.findFirst({ where: { collegeId: me.collegeId, batchId: st.batchId, number: b.semesterNumber }, select: { id: true } });
  const existing = await tx.semesterResult.findUnique({ where: { studentId_semesterNumber: { studentId: me.studentId, semesterNumber: b.semesterNumber } } });
  if (existing?.reviewStatus === "SUBMITTED") throw new ApiError(409, "CONFLICT", "This semester is under review and cannot be changed right now");

  const subjects = b.subjects.map((s) => ({ collegeId: me.collegeId, code: s.code ?? null, name: s.name, marksObtained: s.marksObtained, maxMarks: s.maxMarks, credits: s.credits ?? null, grade: s.grade ?? null, gradePoints: s.gradePoints ?? null }));
  let id: string;
  if (existing?.reviewStatus === "VERIFIED") {
    await tx.semesterResult.update({ where: { id: existing.id }, data: { pendingData: b as object } });
    id = existing.id;
  } else if (existing) {
    await tx.subjectMark.deleteMany({ where: { semesterResultId: existing.id } });
    await tx.semesterResult.update({ where: { id: existing.id }, data: { sgpa: b.sgpa ?? null, resultStatus: b.resultStatus, semesterId: sem?.id ?? null, subjects: { create: subjects } } });
    id = existing.id;
  } else {
    id = (await tx.semesterResult.create({ data: { collegeId: me.collegeId, studentId: me.studentId, semesterId: sem?.id ?? null, semesterNumber: b.semesterNumber, sgpa: b.sgpa ?? null, resultStatus: b.resultStatus, subjects: { create: subjects } } })).id;
  }
  await audit({ collegeId: me.collegeId, userId: null }, { action: existing ? (existing.reviewStatus === "VERIFIED" ? "student.semester.revise" : "student.semester.update") : "student.semester.add", entity: "Student", entityId: me.studentId, after: { semester: b.semesterNumber, subjects: b.subjects.length, ...(via ? { via } : {}) } }, tx);
  const row = await tx.semesterResult.findUniqueOrThrow({ where: { id }, include: { subjects: true } });
  return semesterView(row as unknown as SemRow & { id: string });
}
