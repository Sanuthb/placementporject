import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { notifyStudent } from "@/lib/notify";
import { LMS_STAFF, courseOf } from "@/lib/lmsService";

/** Answer (or change the answer to) a student's question. The student is told. */
export const PATCH = route<{ id: string; qid: string }>(LMS_STAFF, async (req, s, { id, qid }) => {
  const c = await courseOf(s.collegeId, id);
  const q = await db.courseQuestion.findFirst({ where: { id: qid, courseId: id } });
  if (!q) throw notFound("Question not found");
  const { answer } = await parseBody(req, z.object({ answer: z.string().trim().min(2).max(4000) }));
  const u = await db.courseQuestion.update({ where: { id: qid }, data: { answer, answeredById: s.userId, answeredAt: new Date() } });
  await notifyStudent(s.collegeId, q.studentId, { type: "course.answer", title: `Your question in ${c.title} was answered`, body: answer.slice(0, 140), link: `/student/courses/${c.id}` });
  return u;
});
