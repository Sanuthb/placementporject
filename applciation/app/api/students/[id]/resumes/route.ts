import { route } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { departmentScope } from "@/lib/auth/session";
import { db } from "@/lib/db";

/** A student's resumes as staff see them: approved ones and the main one. Drafts are the student's own work and are not listed. */
export const GET = route<{ id: string }>({ module: "ONBOARDING" }, async (_req, s, { id }) => {
  if (!(await db.student.findFirst({ where: { id, collegeId: s.collegeId, ...departmentScope(s) }, select: { id: true } }))) throw notFound("Student not found");
  return db.resumeVersion.findMany({ where: { studentId: id, status: "APPROVED" }, orderBy: { number: "desc" }, select: { id: true, number: true, title: true, kind: true, template: true, isPrimary: true, targetCompany: true, targetRole: true, verifiedOnly: true, approvedAt: true } });
});
