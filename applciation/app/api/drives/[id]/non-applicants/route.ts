import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { evaluateEligibility } from "@/lib/eligibility";
import { getDrive } from "@/lib/drives";

/** Eligible students who have not applied: the recipients of a reminder. Sending arrives with the Communication phase. */
export const GET = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (_req, s, { id }) => {
  const drive = await getDrive(s.collegeId, id);
  const applied = new Set((await db.application.findMany({ where: { driveId: id }, select: { studentId: true } })).map((a) => a.studentId));
  const items = (await evaluateEligibility(drive)).filter((r) => r.eligible && !applied.has(r.studentId)).map(({ studentId, name, enrollmentNo, departmentId }) => ({ studentId, name, enrollmentNo, departmentId }));
  return { count: items.length, items };
});
