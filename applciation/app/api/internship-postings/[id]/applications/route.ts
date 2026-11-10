import { route } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { INT_ADMIN } from "@/lib/internshipService";

/** Applications to one posting, with the student's profile and the rules they did not meet when they applied. */
export const GET = route<{ id: string }>(INT_ADMIN, async (_req, s, { id }) => {
  if (!(await db.internshipPosting.findFirst({ where: { id, collegeId: s.collegeId }, select: { id: true } }))) throw notFound("Posting not found");
  const rows = await db.internshipApplication.findMany({ where: { postingId: id }, orderBy: { createdAt: "asc" }, include: { student: { select: { id: true, name: true, enrollmentNo: true, department: { select: { name: true } } } } } });
  return rows.map((a) => ({ id: a.id, status: a.status, selfSourced: a.selfSourced, note: a.note, eligibilityGaps: a.eligibilityGaps, collegeNote: a.collegeNote, companyNote: a.companyNote, createdAt: a.createdAt, student: a.student }));
});
