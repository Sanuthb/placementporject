import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { LMS_STAFF, courseOf, signedUrl } from "@/lib/lmsService";

/** Assignment submissions, oldest waiting first. Filter by lesson or status (SUBMITTED = still to grade). */
export const GET = route<{ id: string }>(LMS_STAFF, async (req, s, { id }) => {
  await courseOf(s.collegeId, id);
  const q = parseQuery(req, z.object({ lessonId: z.uuid().optional(), status: z.enum(["SUBMITTED", "GRADED", "RETURNED"]).optional() }));
  const rows = await db.assignmentSubmission.findMany({
    where: { lesson: { courseId: id }, ...(q.lessonId ? { lessonId: q.lessonId } : {}), ...(q.status ? { status: q.status } : {}) }, orderBy: { submittedAt: "asc" }, take: 300,
    include: { lesson: { select: { id: true, title: true, maxMarks: true, dueAt: true } }, enrolment: { select: { student: { select: { id: true, name: true, enrollmentNo: true } } } } },
  });
  return Promise.all(rows.map(async ({ filePath, enrolment, ...r }) => ({ ...r, student: enrolment.student, late: !!r.lesson.dueAt && r.submittedAt > r.lesson.dueAt, fileUrl: filePath ? await signedUrl(filePath) : null })));
});
