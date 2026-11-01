import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ensureSession, loadScope, markAttendance } from "@/lib/attendance";

const body = z.object({ roundId: z.uuid().optional(), studentId: z.uuid().optional(), enrollmentNo: z.string().trim().min(1).optional(), status: z.enum(["PRESENT", "ABSENT"]) })
  .refine((v) => v.studentId || v.enrollmentNo, { message: "Give studentId or enrollmentNo" });

/** Manual marking. Staff can search by name (students list) or enter the enrollment number. Also used to correct a mark. */
export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ATTENDANCE_BLOCKING" }, async (req, s, { id }) => {
  const b = await parseBody(req, body);
  const { round } = await loadScope(s.collegeId, id, b.roundId);
  const student = await db.student.findFirst({ where: { collegeId: s.collegeId, ...(b.studentId ? { id: b.studentId } : { enrollmentNo: b.enrollmentNo }) }, select: { id: true } });
  if (!student) throw badRequest("Student not found");
  return db.$transaction(async (tx) => {
    await ensureSession(tx, s.collegeId, id, round);
    const rec = await markAttendance(tx, { collegeId: s.collegeId, driveId: id, round, studentId: student.id, status: b.status, method: "MANUAL", actorId: s.userId });
    await audit(s, { action: "attendance.mark", entity: "Drive", entityId: id, after: { studentId: student.id, status: b.status, roundId: round?.id ?? null } }, tx);
    return { studentId: student.id, status: rec.status };
  });
});
