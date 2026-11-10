import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { notifyStaff } from "@/lib/notify";
import { myEnrolledCourse } from "@/lib/lmsStudent";

/** Ask the course's teachers a question, about the course or one lesson. Staff answer in the course page. */
export const POST = studentRoute<{ id: string }>({ module: "LEARNING", limit: { name: "course-question", max: 30, windowSec: 3600 } }, async (req, me, { id }) => {
  const { course, enrolment } = await myEnrolledCourse(me, id);
  const b = await parseBody(req, z.object({ question: z.string().trim().min(5).max(2000), lessonId: z.uuid().optional() }));
  if (b.lessonId && !(await db.courseLesson.findFirst({ where: { id: b.lessonId, courseId: id }, select: { id: true } }))) throw badRequest("Lesson not found");
  const q = await db.courseQuestion.create({ data: { courseId: id, lessonId: b.lessonId, enrolmentId: enrolment.id, studentId: me.studentId, collegeId: me.collegeId, question: b.question } });
  await notifyStaff(me.collegeId, { type: "course.question", title: `${me.name} asked a question in ${course.title}`, body: b.question.slice(0, 140), link: `/staff/courses/${id}` });
  return { id: q.id };
});
