import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { LMS_STAFF, markLessonDone } from "@/lib/lmsService";
import { lessonOf } from "../route";

type P = { id: string; lid: string };

/** Who joined a live session: every enrolled student, with whether they are marked as attended. */
export const GET = route<P>(LMS_STAFF, async (_req, s, { id, lid }) => {
  const l = await lessonOf(s.collegeId, id, lid);
  if (l.type !== "LIVE") throw badRequest("This lesson is not a live session");
  const rows = await db.courseEnrolment.findMany({ where: { courseId: id, status: { not: "WITHDRAWN" } }, orderBy: { enrolledAt: "asc" }, include: { student: { select: { id: true, name: true, enrollmentNo: true } }, progress: { where: { lessonId: lid }, select: { id: true } } } });
  return rows.map((r) => ({ enrolmentId: r.id, student: r.student, attended: r.progress.length > 0 }));
});

/** Marks students as attended once the session is over. That finishes the lesson for them, and may finish the course. */
export const POST = route<P>(LMS_STAFF, async (req, s, { id, lid }) => {
  const l = await lessonOf(s.collegeId, id, lid);
  if (l.type !== "LIVE") throw badRequest("This lesson is not a live session");
  if (l.startsAt && l.startsAt > new Date()) throw badRequest("The session has not started yet");
  const { enrolmentIds } = await parseBody(req, z.object({ enrolmentIds: z.array(z.uuid()).min(1).max(2000) }));
  const valid = await db.courseEnrolment.findMany({ where: { id: { in: enrolmentIds }, courseId: id, status: { not: "WITHDRAWN" } }, select: { id: true } });
  for (const e of valid) await markLessonDone(e.id, lid);
  await audit(s, { action: "course.live.attendance", entity: "Course", entityId: id, after: { lessonId: lid, marked: valid.length } });
  return { marked: valid.length };
});
