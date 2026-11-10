import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { LMS_STAFF, courseOf } from "@/lib/lmsService";
import { assertTypeFields, cleanFor, createLesson } from "@/lib/lmsLessons";
import type { Prisma } from "@/generated/prisma/client";

/** Adds a lesson at the end of a module. Videos and documents get their file from the /file route afterwards. */
export const POST = route<{ id: string }>(LMS_STAFF, async (req, s, { id }) => {
  await courseOf(s.collegeId, id);
  const { moduleId, type, ...rest } = await parseBody(req, createLesson);
  if (!(await db.courseModule.findFirst({ where: { id: moduleId, courseId: id }, select: { id: true } }))) throw notFound("Module not found");
  assertTypeFields(type, rest);
  if (type === "QUIZ" && rest.passPercent == null) rest.passPercent = 60;
  if (type === "ASSIGNMENT" && rest.maxMarks == null) rest.maxMarks = 10;
  if (type === "LIVE" && rest.startsAt && rest.startsAt < new Date()) throw badRequest("A live session must start in the future");
  const last = await db.courseLesson.aggregate({ where: { moduleId }, _max: { sortOrder: true } });
  const data = Object.fromEntries(Object.entries(cleanFor(type, rest)).filter(([k]) => k !== "questions"));
  const l = await db.courseLesson.create({ data: { ...(data as Prisma.CourseLessonUncheckedCreateInput), title: rest.title, courseId: id, moduleId, collegeId: s.collegeId, type, sortOrder: (last._max.sortOrder ?? 0) + 1, questions: rest.questions && type === "QUIZ" ? (rest.questions as Prisma.InputJsonValue) : undefined } });
  await audit(s, { action: "course.lesson.add", entity: "Course", entityId: id, after: { lessonId: l.id, type, title: l.title } });
  return l;
});
