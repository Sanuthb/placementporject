import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { LMS_STAFF, courseOf, orderedModules, removeCourseFile, signedUrl } from "@/lib/lmsService";
import { publishProblems } from "@/lib/lms";
import { checkAudience, courseFields } from "../route";

type P = { id: string };

/** The whole course for editing: modules, lessons (with quiz answers) and what stops it being published. */
export const GET = route<P>(LMS_STAFF, async (_req, s, { id }) => {
  const course = await courseOf(s.collegeId, id);
  const modules = await orderedModules(id);
  const all = modules.flatMap((m) => m.lessons);
  const withUrls = await Promise.all(modules.map(async (m) => ({ ...m, lessons: await Promise.all(m.lessons.map(async ({ filePath, ...l }) => ({ ...l, hasFile: !!filePath, fileUrl: filePath ? await signedUrl(filePath) : null }))) })));
  return { course, modules: withUrls, publishProblems: publishProblems(all), enrolled: await db.courseEnrolment.count({ where: { courseId: id } }) };
});

export const PATCH = route<P>(LMS_STAFF, async (req, s, { id }) => {
  const before = await courseOf(s.collegeId, id);
  const b = await parseBody(req, courseFields.partial());
  await checkAudience(s.collegeId, b);
  const c = await db.course.update({ where: { id }, data: b });
  await audit(s, { action: "course.update", entity: "Course", entityId: id, before: { title: before.title }, after: { title: c.title } });
  return c;
});

/** Deletes a draft nobody has joined. Anything else is archived instead, so students keep their record. */
export const DELETE = route<P>(LMS_STAFF, async (_req, s, { id }) => {
  const c = await courseOf(s.collegeId, id);
  if (c.status !== "DRAFT" || (await db.courseEnrolment.count({ where: { courseId: id } })) > 0) throw badRequest("Only a draft with no students can be deleted. Archive the course instead");
  const files = await db.courseLesson.findMany({ where: { courseId: id, filePath: { not: null } }, select: { filePath: true } });
  await db.course.delete({ where: { id } });
  await Promise.all(files.map((f) => removeCourseFile(f.filePath)));
  await audit(s, { action: "course.delete", entity: "Course", entityId: id, before: { title: c.title } });
  return { ok: true };
});
