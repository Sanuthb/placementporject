import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { scopedStudent } from "@/lib/verification";
import { educationInput } from "@/lib/api/academic";

type P = { id: string; recordId: string };

export const PATCH = route<P>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (req, s, { id, recordId }) => {
  await scopedStudent(s, id);
  const data = await parseBody(req, educationInput);
  return db.$transaction(async (tx) => {
    const before = await tx.studentEducationRecord.findFirst({ where: { id: recordId, studentId: id, collegeId: s.collegeId } });
    if (!before) throw notFound("Education record not found");
    if (data.isCurrent) await tx.studentEducationRecord.updateMany({ where: { studentId: id, isCurrent: true, id: { not: recordId } }, data: { isCurrent: false } });
    const after = await tx.studentEducationRecord.update({ where: { id: recordId }, data });
    await audit(s, { action: "student.education.update", entity: "Student", entityId: id, before: { qualification: before.qualification, percentage: before.percentage?.toString() ?? null }, after: { qualification: after.qualification, percentage: after.percentage?.toString() ?? null } }, tx);
    return after;
  });
});

export const DELETE = route<P>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (_req, s, { id, recordId }) => {
  await scopedStudent(s, id);
  return db.$transaction(async (tx) => {
    const r = await tx.studentEducationRecord.findFirst({ where: { id: recordId, studentId: id, collegeId: s.collegeId } });
    if (!r) throw notFound("Education record not found");
    await tx.studentEducationRecord.delete({ where: { id: recordId } });
    await audit(s, { action: "student.education.delete", entity: "Student", entityId: id, before: { qualification: r.qualification, level: r.level } }, tx);
    return { deleted: true };
  });
});
