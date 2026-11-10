import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { LMS_STAFF, courseOf, removeCourseFile } from "@/lib/lmsService";
import { assertTypeFields, cleanFor, lessonInUse, patchLesson } from "@/lib/lmsLessons";
import type { Prisma } from "@/generated/prisma/client";

type P = { id: string; lid: string };
export const lessonOf = async (collegeId: string, id: string, lid: string) => {
  await courseOf(collegeId, id);
  const l = await db.courseLesson.findFirst({ where: { id: lid, courseId: id } });
  if (!l) throw notFound("Lesson not found");
  return l;
};

/** Edits a lesson, moves it up or down within its module, or moves it to another module. A quiz's questions are locked once someone has attempted it. */
export const PATCH = route<P>(LMS_STAFF, async (req, s, { id, lid }) => {
  const l = await lessonOf(s.collegeId, id, lid);
  const { move, moduleId, questions, ...rest } = await parseBody(req, patchLesson);
  if (questions !== undefined && l.type === "QUIZ" && (await db.quizAttempt.count({ where: { lessonId: lid } })) > 0) throw badRequest("Students have attempted this quiz, so its questions can no longer change. Add a new quiz instead");
  assertTypeFields(l.type, { url: rest.url === undefined ? l.url : rest.url });
  const clean = Object.fromEntries(Object.entries(cleanFor(l.type, rest)).filter(([k]) => k !== "questions"));
  const data: Prisma.CourseLessonUncheckedUpdateInput = { ...clean };
  if (questions !== undefined && l.type === "QUIZ") data.questions = (questions ?? []) as Prisma.InputJsonValue;
  if (moduleId && moduleId !== l.moduleId) {
    if (!(await db.courseModule.findFirst({ where: { id: moduleId, courseId: id }, select: { id: true } }))) throw notFound("Module not found");
    const last = await db.courseLesson.aggregate({ where: { moduleId }, _max: { sortOrder: true } });
    data.moduleId = moduleId; data.sortOrder = (last._max.sortOrder ?? 0) + 1;
  }
  if (Object.keys(data).length) await db.courseLesson.update({ where: { id: lid }, data });
  if (move) {
    const all = await db.courseLesson.findMany({ where: { moduleId: l.moduleId }, orderBy: { sortOrder: "asc" }, select: { id: true } });
    const i = all.findIndex((x) => x.id === lid), j = move === "up" ? i - 1 : i + 1;
    if (j >= 0 && j < all.length) { [all[i], all[j]] = [all[j], all[i]]; await db.$transaction(all.map((x, n) => db.courseLesson.update({ where: { id: x.id }, data: { sortOrder: n + 1 } }))); }
  }
  await audit(s, { action: "course.lesson.update", entity: "Course", entityId: id, after: { lessonId: lid } });
  return { ok: true };
});

export const DELETE = route<P>(LMS_STAFF, async (_req, s, { id, lid }) => {
  const l = await lessonOf(s.collegeId, id, lid);
  if (await lessonInUse(lid)) throw badRequest("Students have already worked in this lesson. Make it optional instead of deleting it");
  await db.courseLesson.delete({ where: { id: lid } });
  await removeCourseFile(l.filePath);
  await audit(s, { action: "course.lesson.delete", entity: "Course", entityId: id, before: { lessonId: lid, title: l.title } });
  return { ok: true };
});
