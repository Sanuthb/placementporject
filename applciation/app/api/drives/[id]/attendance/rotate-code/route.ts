import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { loadScope, newCode, roundKey } from "@/lib/attendance";

const body = z.object({ roundId: z.uuid().optional() });

/** Issues a fresh code so a code shared outside the room stops working. */
export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ATTENDANCE_BLOCKING" }, async (req, s, { id }) => {
  const { roundId } = await parseBody(req, body.default({}));
  const { round } = await loadScope(s.collegeId, id, roundId);
  const code = newCode();
  const r = await db.attendanceSession.updateMany({ where: { driveId: id, roundKey: roundKey(round?.id), isOpen: true }, data: { code } });
  if (r.count === 0) throw (await db.attendanceSession.count({ where: { driveId: id, roundKey: roundKey(round?.id) } })) ? new ApiError(409, "SESSION_CLOSED", "This attendance session has been closed") : notFound("No attendance session yet; open one first");
  return { code };
});
