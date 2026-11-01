import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";

/** Who opened which student's individual result, when and why. */
export const GET = route({ roles: ["TPO_ADMIN"], module: "PSYCHOMETRICS" }, async (_req, s) => {
  const rows = await db.psychAccessLog.findMany({ where: { collegeId: s.collegeId }, orderBy: { createdAt: "desc" }, take: 200 });
  const [users, students] = await Promise.all([
    db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.actorId))] } }, select: { id: true, name: true } }),
    db.student.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.studentId))] } }, select: { id: true, name: true, enrollmentNo: true } }),
  ]);
  return rows.map((r) => ({ id: r.id, at: r.createdAt, reason: r.reason, staff: users.find((u) => u.id === r.actorId) ?? null, student: students.find((x) => x.id === r.studentId) ?? null }));
});
