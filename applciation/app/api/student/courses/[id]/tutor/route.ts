import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { tutorAnswer } from "@/lib/lmsTutor";
import { myEnrolledCourse } from "@/lib/lmsStudent";

/** Ask the AI tutor about the course or the lesson I am on. Only for students in the course. Quiz questions are never shared with it. */
export const POST = studentRoute<{ id: string }>({ module: "LEARNING", limit: { name: "course-tutor", max: 40, windowSec: 3600 } }, async (req, me, { id }) => {
  const { course } = await myEnrolledCourse(me, id);
  const b = await parseBody(req, z.object({ question: z.string().trim().min(3).max(1000), lessonId: z.uuid().optional(), history: z.array(z.object({ q: z.string().max(1000), a: z.string().max(3000) })).max(10).default([]) }));
  const lesson = b.lessonId ? await db.courseLesson.findFirst({ where: { id: b.lessonId, courseId: id }, select: { title: true, type: true, body: true } }) : null;
  return { answer: await tutorAnswer({ course, lesson: lesson ?? undefined, history: b.history, question: b.question }) };
});
