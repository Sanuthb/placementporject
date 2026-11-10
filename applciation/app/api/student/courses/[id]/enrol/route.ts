import { studentRoute } from "@/lib/api/studentHandler";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { myCourse } from "@/lib/lmsStudent";

type P = { id: string };

/** Join a published course that is open to me. Rejoining after leaving keeps the progress I had. */
export const POST = studentRoute<P>({ module: "LEARNING", limit: { name: "course-enrol", max: 60, windowSec: 3600 } }, async (_req, me, { id }) => {
  const { course, enrolment, withdrawn } = await myCourse(me, id);
  if (enrolment) return { ok: true, already: true };
  if (course.status !== "PUBLISHED") throw badRequest("This course is closed to new students");
  if (!course.selfEnrol) throw badRequest("Your placement office enrols students in this course. Ask them to add you");
  if (withdrawn) await db.courseEnrolment.update({ where: { id: withdrawn.id }, data: { status: "ENROLLED", lastActivityAt: new Date() } });
  else await db.courseEnrolment.create({ data: { courseId: id, studentId: me.studentId, collegeId: me.collegeId } }).catch((e) => { if ((e as { code?: string }).code !== "P2002") throw e; });
  return { ok: true };
});

/** Leave a course. Your progress is kept if you join again; a certificate you earned stays yours. */
export const DELETE = studentRoute<P>({ module: "LEARNING" }, async (_req, me, { id }) => {
  const { enrolment } = await myCourse(me, id);
  if (!enrolment) return { ok: true };
  if (enrolment.status === "COMPLETED") throw badRequest("You have completed this course");
  await db.courseEnrolment.update({ where: { id: enrolment.id }, data: { status: "WITHDRAWN" } });
  return { ok: true };
});
