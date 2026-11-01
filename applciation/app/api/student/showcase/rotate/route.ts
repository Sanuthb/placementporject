import { studentRoute } from "@/lib/api/studentHandler";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { newToken } from "@/lib/showcase";

/** Issues a new link; the old one stops working immediately. */
export const POST = studentRoute({ module: "TALENT_SHOWCASE" }, async (_req, me) => {
  const r = await db.showcaseProfile.updateMany({ where: { studentId: me.studentId }, data: { token: newToken() } });
  if (r.count === 0) throw new ApiError(404, "NOT_FOUND", "You have not set up a showcase profile yet");
  const p = await db.showcaseProfile.findUniqueOrThrow({ where: { studentId: me.studentId } });
  return { link: p.isEnabled ? `/api/showcase/${p.token}` : null };
});
