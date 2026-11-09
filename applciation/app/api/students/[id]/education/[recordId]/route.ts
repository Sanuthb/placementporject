import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { scopedStudent } from "@/lib/verification";
import { refreshVerifiedSnapshot } from "@/lib/academicRecords";

/** Every value of a record, for the audit trail (numbers as text so the log is exact). */
const snap = (r: Record<string, unknown>) => Object.fromEntries(["level", "qualification", "specialisation", "institution", "boardOrUniversity", "admissionYear", "completionYear", "percentage", "cgpa", "maxMarks", "obtainedMarks", "backlogs", "status", "reviewStatus"].map((k) => [k, r[k] == null ? null : typeof r[k] === "object" ? String(r[k]) : r[k]]));
import { educationInput } from "@/lib/api/academic";

type P = { id: string; recordId: string };

export const PATCH = route<P>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (req, s, { id, recordId }) => {
  await scopedStudent(s, id);
  const data = await parseBody(req, educationInput);
  return db.$transaction(async (tx) => {
    const before = await tx.studentEducationRecord.findFirst({ where: { id: recordId, studentId: id, collegeId: s.collegeId } });
    if (!before) throw notFound("Education record not found");
    if (data.isCurrent) await tx.studentEducationRecord.updateMany({ where: { studentId: id, isCurrent: true, id: { not: recordId } }, data: { isCurrent: false } });
    // Staff are the authorised verifiers, so an edit to a verified record stays verified and is stamped with who made it; the audit log keeps the old and new values.
    const after = await tx.studentEducationRecord.update({ where: { id: recordId }, data: { ...data, ...(before.reviewStatus === "VERIFIED" ? { verifiedAt: new Date(), verifiedById: s.userId } : {}) } });
    await audit(s, { action: "student.education.update", entity: "Student", entityId: id, before: snap(before), after: snap(after) }, tx);
    await refreshVerifiedSnapshot(tx, id, "EDUCATION_HISTORY");
    await refreshVerifiedSnapshot(tx, id, "ACADEMICS");
    return after;
  });
});

export const DELETE = route<P>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (_req, s, { id, recordId }) => {
  await scopedStudent(s, id);
  return db.$transaction(async (tx) => {
    const r = await tx.studentEducationRecord.findFirst({ where: { id: recordId, studentId: id, collegeId: s.collegeId } });
    if (!r) throw notFound("Education record not found");
    await tx.studentEducationRecord.delete({ where: { id: recordId } });
    await audit(s, { action: "student.education.delete", entity: "Student", entityId: id, before: snap(r) }, tx);
    await refreshVerifiedSnapshot(tx, id, "EDUCATION_HISTORY");
    await refreshVerifiedSnapshot(tx, id, "ACADEMICS");
    return { deleted: true };
  });
});
