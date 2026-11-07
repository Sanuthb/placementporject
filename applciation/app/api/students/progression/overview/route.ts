import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { departmentScope } from "@/lib/auth/session";

const query = z.object({ batchId: z.uuid() });

/** For one batch: each semester with how many active students are in it now, plus those with no semester set. */
export const GET = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER", "DEPARTMENT_COORDINATOR"], module: "ONBOARDING" }, async (req, s) => {
  const { batchId } = parseQuery(req, query);
  const batch = await db.batch.findFirst({ where: { id: batchId, collegeId: s.collegeId }, select: { id: true, name: true } });
  if (!batch) throw badRequest("Batch not found");
  const where = { collegeId: s.collegeId, ...departmentScope(s), batchId, isActive: true, isArchived: false };
  const [semesters, groups] = await Promise.all([
    db.semester.findMany({ where: { batchId, collegeId: s.collegeId }, select: { id: true, number: true, name: true, status: true, academicYear: { select: { name: true } } }, orderBy: { number: "asc" } }),
    db.student.groupBy({ by: ["currentSemesterId"], where, _count: { _all: true } }),
  ]);
  const count = new Map(groups.map((g) => [g.currentSemesterId, g._count._all]));
  return {
    batch,
    unassigned: count.get(null) ?? 0,
    semesters: semesters.map((m) => ({ ...m, academicYear: m.academicYear?.name ?? null, students: count.get(m.id) ?? 0 })),
  };
});
