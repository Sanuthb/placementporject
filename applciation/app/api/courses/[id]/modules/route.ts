import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { LMS_STAFF, courseOf } from "@/lib/lmsService";

export const POST = route<{ id: string }>(LMS_STAFF, async (req, s, { id }) => {
  await courseOf(s.collegeId, id);
  const { title } = await parseBody(req, z.object({ title: z.string().trim().min(2).max(200) }));
  const last = await db.courseModule.aggregate({ where: { courseId: id }, _max: { sortOrder: true } });
  return db.courseModule.create({ data: { courseId: id, title, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
});
