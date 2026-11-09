import { studentRoute } from "@/lib/api/studentHandler";
import { ApiError, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertSectionOpen } from "@/lib/academicRecords";

/** Remove a backlog entry made by mistake. Once any attempt is under review or verified the history is kept and cannot be removed. */
export const DELETE = studentRoute<{ id: string }>({ module: "ONBOARDING" }, async (_req, me, { id }) => {
  return db.$transaction(async (tx) => {
    const b = await tx.backlog.findFirst({ where: { id, studentId: me.studentId }, include: { attempts: { select: { reviewStatus: true } } } });
    if (!b) throw notFound("Backlog not found");
    await assertSectionOpen(tx, me.studentId, "ACADEMICS");
    if (b.attempts.some((a) => a.reviewStatus === "VERIFIED" || a.reviewStatus === "SUBMITTED")) throw new ApiError(409, "CONFLICT", "This backlog's history has been verified or is under review and is kept on record");
    await tx.backlog.delete({ where: { id } });
    await audit({ collegeId: me.collegeId, userId: null }, { action: "student.backlog.delete", entity: "Student", entityId: me.studentId, before: { subject: b.subjectName, semester: b.semesterNumber } }, tx);
    return { deleted: true };
  });
});
