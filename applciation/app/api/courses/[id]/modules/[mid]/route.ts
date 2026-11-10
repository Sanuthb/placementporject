import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { LMS_STAFF, courseOf, removeCourseFile } from "@/lib/lmsService";
import { lessonInUse } from "@/lib/lmsLessons";

type P = { id: string; mid: string };
const mine = async (collegeId: string, id: string, mid: string) => {
  await courseOf(collegeId, id);
  const m = await db.courseModule.findFirst({ where: { id: mid, courseId: id } });
  if (!m) throw notFound("Module not found");
  return m;
};

/** Rename a module or move it one place up or down. */
export const PATCH = route<P>(LMS_STAFF, async (req, s, { id, mid }) => {
  const m = await mine(s.collegeId, id, mid);
  const b = await parseBody(req, z.object({ title: z.string().trim().min(2).max(200).optional(), move: z.enum(["up", "down"]).optional() }));
  if (b.title) await db.courseModule.update({ where: { id: mid }, data: { title: b.title } });
  if (b.move) {
    const all = await db.courseModule.findMany({ where: { courseId: id }, orderBy: { sortOrder: "asc" }, select: { id: true } });
    const i = all.findIndex((x) => x.id === m.id), j = b.move === "up" ? i - 1 : i + 1;
    if (j >= 0 && j < all.length) { [all[i], all[j]] = [all[j], all[i]]; await db.$transaction(all.map((x, n) => db.courseModule.update({ where: { id: x.id }, data: { sortOrder: n + 1 } }))); }
  }
  return { ok: true };
});

/** Removes a module and its lessons, unless a student has already worked in one of them. */
export const DELETE = route<P>(LMS_STAFF, async (_req, s, { id, mid }) => {
  await mine(s.collegeId, id, mid);
  const lessons = await db.courseLesson.findMany({ where: { moduleId: mid }, select: { id: true, filePath: true } });
  for (const l of lessons) if (await lessonInUse(l.id)) throw badRequest("Students have already worked in this module. Make its lessons optional instead of deleting it");
  await db.courseModule.delete({ where: { id: mid } });
  await Promise.all(lessons.map((l) => removeCourseFile(l.filePath)));
  return { ok: true };
});
