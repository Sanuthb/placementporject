import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { educationInput } from "@/lib/api/academic";
import { assertEducationEditable } from "@/lib/invitations/guard";
import { reviseEducationRecord } from "@/lib/studentAcademicWrites";
import { ApiError } from "@/lib/api/errors";

type P = { recordId: string };

export const PUT = studentRoute<P>({ module: "ONBOARDING" }, async (req, me, { recordId }) => {
  const b = await parseBody(req, educationInput);
  await assertEducationEditable(me.studentId);
  return db.$transaction((tx) => reviseEducationRecord(tx, me, recordId, b));
});

export const DELETE = studentRoute<P>({ module: "ONBOARDING" }, async (_req, me, { recordId }) => {
  await assertEducationEditable(me.studentId);
  const row = await db.studentEducationRecord.findFirst({ where: { id: recordId, studentId: me.studentId }, select: { reviewStatus: true } });
  if (!row) throw notFound("Qualification not found");
  if (row.reviewStatus === "VERIFIED" || row.reviewStatus === "SUBMITTED") throw new ApiError(409, "CONFLICT", "A qualification that has been verified or is under review cannot be deleted. Raise a data correction request instead");
  const del = await db.studentEducationRecord.deleteMany({ where: { id: recordId, studentId: me.studentId } });
  if (del.count === 0) throw notFound("Qualification not found");
  await audit({ collegeId: me.collegeId, userId: null }, { action: "student.education.delete", entity: "Student", entityId: me.studentId, after: { recordId } });
  return { deleted: true };
});
