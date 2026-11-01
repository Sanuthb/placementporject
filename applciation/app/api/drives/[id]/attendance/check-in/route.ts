import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { checkInWithCode } from "@/lib/attendance";

const body = z.object({ roundId: z.uuid().optional(), code: z.string().trim().toUpperCase().length(6), studentId: z.uuid().optional(), enrollmentNo: z.string().trim().min(1).optional() })
  .refine((v) => v.studentId || v.enrollmentNo, { message: "Give studentId or enrollmentNo" });

/** Checks a student in with the session code (staff on a student's behalf; students use /api/student/attendance/check-in). */
export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ATTENDANCE_BLOCKING" }, async (req, s, { id }) => {
  const b = await parseBody(req, body);
  const student = await db.student.findFirst({ where: { collegeId: s.collegeId, ...(b.studentId ? { id: b.studentId } : { enrollmentNo: b.enrollmentNo }) }, select: { id: true } });
  if (!student) throw badRequest("Student not found");
  await checkInWithCode({ collegeId: s.collegeId, driveId: id, roundId: b.roundId, code: b.code, studentId: student.id, actorId: s.userId });
  await audit(s, { action: "attendance.checkin", entity: "Drive", entityId: id, after: { studentId: student.id } });
  return { studentId: student.id, status: "PRESENT" };
});
