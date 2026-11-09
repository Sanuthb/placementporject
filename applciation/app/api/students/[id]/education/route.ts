import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { scopedStudent } from "@/lib/verification";
import { refreshVerifiedSnapshot } from "@/lib/academicRecords";
import { educationInput } from "@/lib/api/academic";

const MAX_RECORDS = 12;

export const GET = route<{ id: string }>({ module: "ONBOARDING" }, async (_req, s, { id }) => {
  await scopedStudent(s, id);
  return db.studentEducationRecord.findMany({ where: { studentId: id, collegeId: s.collegeId }, orderBy: [{ completionYear: "asc" }, { createdAt: "asc" }] });
});

export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (req, s, { id }) => {
  await scopedStudent(s, id);
  const data = await parseBody(req, educationInput);
  return db.$transaction(async (tx) => {
    if ((await tx.studentEducationRecord.count({ where: { studentId: id } })) >= MAX_RECORDS) throw badRequest(`At most ${MAX_RECORDS} education records per student`);
    // Only one qualification is the current one.
    if (data.isCurrent) await tx.studentEducationRecord.updateMany({ where: { studentId: id, isCurrent: true }, data: { isCurrent: false } });
    // Added by staff to a profile that is already verified, it is part of the verified record; otherwise it is a draft like any other.
    const sec = await tx.studentSection.findUnique({ where: { studentId_section: { studentId: id, section: "EDUCATION_HISTORY" } }, select: { status: true } });
    const verified = sec?.status === "VERIFIED";
    const r = await tx.studentEducationRecord.create({ data: { ...data, collegeId: s.collegeId, studentId: id, ...(verified ? { reviewStatus: "VERIFIED" as const, verifiedAt: new Date(), verifiedById: s.userId } : {}) } });
    await audit(s, { action: "student.education.add", entity: "Student", entityId: id, after: { qualification: r.qualification, level: r.level, institution: r.institution, percentage: r.percentage?.toString() ?? null, reviewStatus: r.reviewStatus } }, tx);
    if (verified) { await refreshVerifiedSnapshot(tx, id, "EDUCATION_HISTORY"); await refreshVerifiedSnapshot(tx, id, "ACADEMICS"); }
    return r;
  });
});
