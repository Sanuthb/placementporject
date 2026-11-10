import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { LMS_STAFF, courseOverview } from "@/lib/lmsService";

export const courseFields = z.object({
  title: z.string().trim().min(3).max(200), summary: z.string().trim().max(500).nullish(), description: z.string().trim().max(10000).nullish(),
  category: z.string().trim().max(60).nullish(), level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).nullish(), skills: z.array(z.string().trim().min(1).max(40)).max(15).optional(),
  departmentId: z.uuid().nullish(), batchId: z.uuid().nullish(), certificateEnabled: z.boolean().optional(), selfEnrol: z.boolean().optional(),
});

/** Checks a department and batch belong to this college. */
export async function checkAudience(collegeId: string, b: { departmentId?: string | null; batchId?: string | null }) {
  if (b.departmentId && !(await db.department.findFirst({ where: { id: b.departmentId, collegeId }, select: { id: true } }))) throw badRequest("Department not found");
  if (b.batchId && !(await db.batch.findFirst({ where: { id: b.batchId, collegeId }, select: { id: true } }))) throw badRequest("Batch not found");
}

/** Every course with its enrolment and completion at a glance. */
export const GET = route(LMS_STAFF, (_req, s) => courseOverview(s.collegeId));

/** Starts a course as a draft. Add modules and lessons, then publish it. */
export const POST = route(LMS_STAFF, async (req, s) => {
  const b = await parseBody(req, courseFields);
  await checkAudience(s.collegeId, b);
  const c = await db.course.create({ data: { ...b, collegeId: s.collegeId, createdById: s.userId } });
  await audit(s, { action: "course.create", entity: "Course", entityId: c.id, after: { title: c.title } });
  return c;
});
