import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { checkInWithCode } from "@/lib/attendance";

const body = z.object({ driveId: z.uuid(), roundId: z.uuid().optional(), code: z.string().trim().min(6).max(6) });

/** Scan the QR or type the code shown in the room. */
export const POST = studentRoute({ limit: { name: "checkin", max: 60, windowSec: 3600 }, module: "ATTENDANCE_BLOCKING" }, async (req, me) => {
  const b = await parseBody(req, body);
  await checkInWithCode({ collegeId: me.collegeId, driveId: b.driveId, roundId: b.roundId, code: b.code, studentId: me.studentId, actorId: null });
  return { status: "PRESENT" };
});
