import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { educationInput } from "@/lib/api/academic";
import { assertEditable } from "@/lib/invitations/guard";

type P = { recordId: string };

export const PUT = studentRoute<P>({ module: "ONBOARDING" }, async (req, me, { recordId }) => {
  const b = await parseBody(req, educationInput);
  await assertEditable(me.studentId);
  return db.$transaction(async (tx) => {
    const own = await tx.studentEducationRecord.updateMany({ where: { id: recordId, studentId: me.studentId }, data: b });
    if (own.count === 0) throw notFound("Qualification not found");
    await audit({ collegeId: me.collegeId, userId: null }, { action: "student.education.update", entity: "Student", entityId: me.studentId, after: { recordId, level: b.level } }, tx);
    return tx.studentEducationRecord.findUniqueOrThrow({ where: { id: recordId } });
  });
});

export const DELETE = studentRoute<P>({ module: "ONBOARDING" }, async (_req, me, { recordId }) => {
  await assertEditable(me.studentId);
  const del = await db.studentEducationRecord.deleteMany({ where: { id: recordId, studentId: me.studentId } });
  if (del.count === 0) throw notFound("Qualification not found");
  await audit({ collegeId: me.collegeId, userId: null }, { action: "student.education.delete", entity: "Student", entityId: me.studentId, after: { recordId } });
  return { deleted: true };
});
