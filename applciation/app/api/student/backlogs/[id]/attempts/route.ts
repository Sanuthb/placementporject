import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertSectionOpen, attemptInput, backlogView, nextAttemptNumber, type BacklogRow } from "@/lib/academicRecords";

/** Record another attempt at a backlog subject, failed or cleared. Earlier attempts are never changed. */
export const POST = studentRoute<{ id: string }>({ module: "ONBOARDING", limit: { name: "academic-write", max: 300, windowSec: 3600 } }, async (req, me, { id }) => {
  const b = await parseBody(req, attemptInput);
  return db.$transaction(async (tx) => {
    const backlog = await tx.backlog.findFirst({ where: { id, studentId: me.studentId }, include: { attempts: true } });
    if (!backlog) throw notFound("Backlog not found");
    await assertSectionOpen(tx, me.studentId, "ACADEMICS");
    if (b.outcome === "CLEARED" && b.clearedInSemester! < backlog.semesterNumber) throw badRequest(`It cannot be cleared in a semester before the one it was failed in (semester ${backlog.semesterNumber})`);
    const attemptNumber = nextAttemptNumber(backlog.attempts);
    await tx.backlogAttempt.create({ data: { collegeId: me.collegeId, backlogId: id, attemptNumber, examSession: b.examSession ?? null, marksObtained: b.marksObtained ?? null, outcome: b.outcome, clearedInSemester: b.outcome === "CLEARED" ? b.clearedInSemester ?? null : null } });
    await audit({ collegeId: me.collegeId, userId: null }, { action: "student.backlog.attempt", entity: "Student", entityId: me.studentId, after: { subject: backlog.subjectName, attempt: attemptNumber, outcome: b.outcome } }, tx);
    const fresh = await tx.backlog.findUniqueOrThrow({ where: { id }, include: { attempts: true } });
    return backlogView(fresh as unknown as BacklogRow & { id: string });
  });
});
