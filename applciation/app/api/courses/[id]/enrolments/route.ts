import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { audit } from "@/lib/audit";
import { resolveStudents } from "@/lib/learning";
import { LMS_STAFF, courseOf, enrolStudents, roster } from "@/lib/lmsService";

/** Who is in the course, with progress, quiz average, assignments waiting and whether they are active or stalled. */
export const GET = route<{ id: string }>(LMS_STAFF, async (_req, s, { id }) => {
  await courseOf(s.collegeId, id);
  return roster(id);
});

/** Enrols students: a list, or everyone active in a department and/or batch. Students already in the course are skipped. */
export const POST = route<{ id: string }>(LMS_STAFF, async (req, s, { id }) => {
  const c = await courseOf(s.collegeId, id);
  if (c.status !== "PUBLISHED") throw badRequest("Publish the course before enrolling students");
  const b = await parseBody(req, z.object({ studentIds: z.array(z.uuid()).max(2000).optional(), departmentId: z.uuid().optional(), batchId: z.uuid().optional() }));
  const ids = await resolveStudents(s.collegeId, b);
  const added = await enrolStudents(c, ids, s.userId);
  await audit(s, { action: "course.enrol", entity: "Course", entityId: id, after: { requested: ids.length, added } });
  return { requested: ids.length, added, alreadyIn: ids.length - added };
});
