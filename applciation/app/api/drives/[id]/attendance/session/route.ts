import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { ensureSession, loadScope } from "@/lib/attendance";

const body = z.object({ roundId: z.uuid().optional() });

/** Opens (or returns) the check-in session. Show `qrPayload` as a QR code, or show `code` for students to type. */
export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ATTENDANCE_BLOCKING" }, async (req, s, { id }) => {
  const { roundId } = await parseBody(req, body.default({}));
  const { round } = await loadScope(s.collegeId, id, roundId);
  const session = await db.$transaction((tx) => ensureSession(tx, s.collegeId, id, round));
  if (!session.isOpen) throw new ApiError(409, "SESSION_CLOSED", "This attendance session has been closed");
  return { sessionId: session.id, code: session.code, qrPayload: `placement-checkin:${session.id}:${session.code}`, roundId: round?.id ?? null };
});
