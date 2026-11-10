import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { LMS_STAFF, courseOf, orderedModules } from "@/lib/lmsService";
import { publishProblems } from "@/lib/lms";

/**
 * PUBLISHED: students can find and join it (needs every lesson to be complete). ARCHIVED: closed to new students, enrolled students keep their access.
 * DRAFT: only while nobody has joined.
 */
export const POST = route<{ id: string }>(LMS_STAFF, async (req, s, { id }) => {
  const { status } = await parseBody(req, z.object({ status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]) }));
  const c = await courseOf(s.collegeId, id);
  if (c.status === status) return c;
  if (status === "PUBLISHED") {
    const problems = publishProblems((await orderedModules(id)).flatMap((m) => m.lessons));
    if (problems.length) throw badRequest("This course is not ready to publish", problems);
  }
  if (status === "DRAFT" && (await db.courseEnrolment.count({ where: { courseId: id } })) > 0) throw badRequest("Students have joined this course, so it cannot go back to draft. Archive it instead");
  const now = new Date();
  const u = await db.course.update({ where: { id }, data: { status, publishedAt: status === "PUBLISHED" ? (c.publishedAt ?? now) : c.publishedAt, archivedAt: status === "ARCHIVED" ? now : null } });
  await audit(s, { action: `course.${status.toLowerCase()}`, entity: "Course", entityId: id, before: { status: c.status }, after: { status } });
  return u;
});
