import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { loadScope, roundKey } from "@/lib/attendance";

const body = z.object({ roundId: z.uuid().optional(), studentId: z.uuid(), reason: z.string().trim().min(3).max(500) });

/** Excuses an absence (medical, clash with an exam...) so it does not count towards a block. */
export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ATTENDANCE_BLOCKING" }, async (req, s, { id }) => {
  const b = await parseBody(req, body);
  const { round } = await loadScope(s.collegeId, id, b.roundId);
  return db.$transaction(async (tx) => {
    const r = await tx.attendanceRecord.updateMany({ where: { driveId: id, roundKey: roundKey(round?.id), studentId: b.studentId, status: "ABSENT" }, data: { excused: true, excuseReason: b.reason } });
    if (r.count === 0) throw new ApiError(404, "NOT_FOUND", "No absence recorded for this student");
    await audit(s, { action: "attendance.excuse", entity: "Drive", entityId: id, after: { studentId: b.studentId }, reason: b.reason }, tx);
    return { studentId: b.studentId, excused: true };
  });
});
