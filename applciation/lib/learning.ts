import { z } from "zod";
import { db } from "@/lib/db";
import { badRequest } from "@/lib/api/errors";

export const stepSchema = z.object({ title: z.string().trim().min(2).max(200), type: z.enum(["COURSE", "RESOURCE", "ASSIGNMENT", "ASSESSMENT"]), url: z.url().optional(), hours: z.number().min(0).max(500).optional() });
export type Step = z.infer<typeof stepSchema>;
export const stepsOf = (json: unknown): Step[] => (Array.isArray(json) ? (json as Step[]) : []);

/** Students to enrol: an explicit list, or everyone active in a department and/or batch. */
export async function resolveStudents(collegeId: string, f: { studentIds?: string[]; departmentId?: string; batchId?: string }) {
  if (!f.studentIds?.length && !f.departmentId && !f.batchId) throw badRequest("Give studentIds, a departmentId or a batchId");
  const rows = await db.student.findMany({
    where: { collegeId, isActive: true, isArchived: false, ...(f.studentIds?.length ? { id: { in: f.studentIds } } : { departmentId: f.departmentId, batchId: f.batchId }) },
    select: { id: true }, take: 2001,
  });
  if (rows.length > 2000) throw badRequest("That group has more than 2000 students; narrow it down");
  return rows.map((r) => r.id);
}
