import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyStudent } from "@/lib/notify";
import { marksValid } from "@/lib/lms";
import { LMS_STAFF, courseOf } from "@/lib/lmsService";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("GRADE"), marks: z.number().int(), feedback: z.string().trim().max(2000).optional() }),
  z.object({ action: z.literal("RETURN"), feedback: z.string().trim().min(3, "Say what to change").max(2000) }),
]);

/** Grade a submission, or send it back for another try with a note. The student is told either way. */
export const PATCH = route<{ id: string; sid: string }>(LMS_STAFF, async (req, s, { id, sid }) => {
  const c = await courseOf(s.collegeId, id);
  const sub = await db.assignmentSubmission.findFirst({ where: { id: sid, lesson: { courseId: id } }, include: { lesson: { select: { title: true, maxMarks: true } } } });
  if (!sub) throw notFound("Submission not found");
  const b = await parseBody(req, body);
  if (b.action === "GRADE" && !marksValid(b.marks, sub.lesson.maxMarks)) throw badRequest(`Marks must be a whole number from 0 to ${sub.lesson.maxMarks ?? 100}`);
  const data = b.action === "GRADE"
    ? { status: "GRADED" as const, marks: b.marks, feedback: b.feedback ?? null, gradedById: s.userId, gradedAt: new Date() }
    : { status: "RETURNED" as const, marks: null, feedback: b.feedback, gradedById: s.userId, gradedAt: new Date() };
  const u = await db.assignmentSubmission.update({ where: { id: sid }, data });
  await notifyStudent(s.collegeId, sub.studentId, { type: "course.assignment", title: b.action === "GRADE" ? `Your assignment "${sub.lesson.title}" was graded` : `Your assignment "${sub.lesson.title}" was sent back`, body: b.feedback, link: `/student/courses/${c.id}` });
  await audit(s, { action: `course.assignment.${b.action.toLowerCase()}`, entity: "Course", entityId: id, after: { submissionId: sid, marks: u.marks } });
  return u;
});
