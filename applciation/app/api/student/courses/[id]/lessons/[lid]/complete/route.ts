import { studentRoute } from "@/lib/api/studentHandler";
import { badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { markLessonDone } from "@/lib/lmsService";
import { myEnrolledCourse } from "@/lib/lmsStudent";

/** Mark a video, document, link or text lesson as done. Quizzes, assignments and live sessions finish themselves. */
export const POST = studentRoute<{ id: string; lid: string }>({ module: "LEARNING", limit: { name: "course-write", max: 400, windowSec: 3600 } }, async (_req, me, { id, lid }) => {
  const { enrolment } = await myEnrolledCourse(me, id);
  const l = await db.courseLesson.findFirst({ where: { id: lid, courseId: id } });
  if (!l) throw notFound("Lesson not found");
  if (!["VIDEO", "DOCUMENT", "LINK", "TEXT"].includes(l.type)) throw badRequest(l.type === "QUIZ" ? "Pass the quiz to finish this lesson" : l.type === "ASSIGNMENT" ? "Submit the assignment to finish this lesson" : "Your teacher marks attendance for live sessions");
  return markLessonDone(enrolment.id, lid);
});
