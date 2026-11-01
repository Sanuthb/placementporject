import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { attendanceSummary, ensureSession, expectedApplications, loadScope, markAttendance, roundKey } from "@/lib/attendance";

const body = z.object({ roundId: z.uuid().optional() });

/** Closes the session and marks everyone not yet marked as absent. Safe to repeat. */
export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ATTENDANCE_BLOCKING" }, async (req, s, { id }) => {
  const { roundId } = await parseBody(req, body.default({}));
  const { round } = await loadScope(s.collegeId, id, roundId);
  const marked = await db.$transaction(async (tx) => {
    await ensureSession(tx, s.collegeId, id, round);
    const [expected, existing] = await Promise.all([expectedApplications(tx, id, round), tx.attendanceRecord.findMany({ where: { driveId: id, roundKey: roundKey(round?.id) }, select: { studentId: true } })]);
    const done = new Set(existing.map((e) => e.studentId));
    const missing = expected.filter((e) => !done.has(e.studentId));
    for (const m of missing) await markAttendance(tx, { collegeId: s.collegeId, driveId: id, round, studentId: m.studentId, status: "ABSENT", method: "AUTO_CLOSE", actorId: s.userId });
    await tx.attendanceSession.updateMany({ where: { driveId: id, roundKey: roundKey(round?.id), isOpen: true }, data: { isOpen: false, closedAt: new Date(), closedById: s.userId } });
    await audit(s, { action: "attendance.close", entity: "Drive", entityId: id, after: { roundId: round?.id ?? null, markedAbsent: missing.length } }, tx);
    return missing.length;
  });
  return { markedAbsent: marked, ...(await attendanceSummary(s.collegeId, id, round, false)) };
});
