import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { departmentScope } from "@/lib/auth/session";

const query = z.object({ departmentId: z.uuid().optional(), batchId: z.uuid().optional(), status: z.enum(["completed", "pending"]).optional(), limit: z.coerce.number().int().min(1).max(500).default(100) });

/** Who has completed the assessment and who has not. Completion only: no scores are shown here. */
export const GET = route({ module: "PSYCHOMETRICS" }, async (req, s) => {
  const q = parseQuery(req, query);
  const scope = departmentScope(s);
  const where = { collegeId: s.collegeId, isActive: true, isArchived: false, participationStatus: "REGISTERED" as const, ...scope, departmentId: scope.departmentId ?? q.departmentId, batchId: q.batchId };
  const [total, done, rows] = await Promise.all([
    db.student.count({ where }),
    db.student.count({ where: { ...where, psychAttempts: { some: { isCurrent: true } } } }),
    db.student.findMany({ where: { ...where, ...(q.status ? { psychAttempts: q.status === "completed" ? { some: { isCurrent: true } } : { none: {} } } : {}) }, select: { id: true, name: true, enrollmentNo: true, departmentId: true, batchId: true, psychAttempts: { where: { isCurrent: true }, select: { completedAt: true }, take: 1 } }, orderBy: { name: "asc" }, take: q.limit }),
  ]);
  return { total, completed: done, pending: total - done, students: rows.map(({ psychAttempts, ...r }) => ({ ...r, completed: psychAttempts.length > 0, completedAt: psychAttempts[0]?.completedAt ?? null })) };
});
