import { studentRoute } from "@/lib/api/studentHandler";
import { ApiError, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertSectionOpen } from "@/lib/academicRecords";

/** Remove a semester I added. A verified semester stays on record; to change it, edit it and send the revision for review. */
export const DELETE = studentRoute<{ id: string }>({ module: "ONBOARDING" }, async (_req, me, { id }) => {
  return db.$transaction(async (tx) => {
    const r = await tx.semesterResult.findFirst({ where: { id, studentId: me.studentId } });
    if (!r) throw notFound("Semester not found");
    await assertSectionOpen(tx, me.studentId, "ACADEMICS");
    if (r.reviewStatus === "VERIFIED" || r.reviewStatus === "SUBMITTED") throw new ApiError(409, "CONFLICT", "A semester that has been verified or is under review cannot be deleted");
    await tx.semesterResult.delete({ where: { id } });
    await audit({ collegeId: me.collegeId, userId: null }, { action: "student.semester.delete", entity: "Student", entityId: me.studentId, before: { semester: r.semesterNumber } }, tx);
    return { deleted: true };
  });
});
