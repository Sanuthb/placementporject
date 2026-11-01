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
    db.student.count({ where: { ...where, psychAttempt: { isNot: null } } }),
    db.student.findMany({ where: { ...where, ...(q.status ? { psychAttempt: q.status === "completed" ? { isNot: null } : null } : {}) }, select: { id: true, name: true, enrollmentNo: true, departmentId: true, batchId: true, psychAttempt: { select: { completedAt: true } } }, orderBy: { name: "asc" }, take: q.limit }),
  ]);
  return { total, completed: done, pending: total - done, students: rows.map(({ psychAttempt, ...r }) => ({ ...r, completed: !!psychAttempt, completedAt: psychAttempt?.completedAt ?? null })) };
});
