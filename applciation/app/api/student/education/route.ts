import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { educationInput } from "@/lib/api/academic";
import { assertEducationEditable } from "@/lib/invitations/guard";

const MAX = 12;

/** Previous qualifications. The programme the institution assigned is separate and is not listed here. */
export const GET = studentRoute({ module: "ONBOARDING" }, (_req, me) => db.studentEducationRecord.findMany({ where: { studentId: me.studentId }, orderBy: [{ completionYear: "asc" }, { createdAt: "asc" }] }));

export const POST = studentRoute({ module: "ONBOARDING", limit: { name: "education-write", max: 200, windowSec: 3600 } }, async (req, me) => {
  const b = await parseBody(req, educationInput);
  await assertEducationEditable(me.studentId);
  if ((await db.studentEducationRecord.count({ where: { studentId: me.studentId } })) >= MAX) throw badRequest(`At most ${MAX} qualifications`);
  return db.$transaction(async (tx) => {
    const r = await tx.studentEducationRecord.create({ data: { ...b, collegeId: me.collegeId, studentId: me.studentId } });
    await tx.student.update({ where: { id: me.studentId }, data: { lastActivityAt: new Date() } });
    await audit({ collegeId: me.collegeId, userId: null }, { action: "student.education.add", entity: "Student", entityId: me.studentId, after: { level: b.level, institution: b.institution } }, tx);
    return r;
  });
});
