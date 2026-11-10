import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { LMS_STAFF, courseOf } from "@/lib/lmsService";

/** Questions students asked, unanswered first. */
export const GET = route<{ id: string }>(LMS_STAFF, async (req, s, { id }) => {
  await courseOf(s.collegeId, id);
  const { open } = parseQuery(req, z.object({ open: z.enum(["true", "false"]).optional() }));
  const rows = await db.courseQuestion.findMany({
    where: { courseId: id, ...(open === "true" ? { answeredAt: null } : {}) }, orderBy: [{ answeredAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }], take: 300,
    include: { lesson: { select: { title: true } }, enrolment: { select: { student: { select: { id: true, name: true } } } } },
  });
  return rows.map(({ enrolment, ...r }) => ({ ...r, student: enrolment.student }));
});
