import { route } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { MATCH_ADMIN } from "@/lib/matchingService";

/** Take a student off the shortlist. */
export const DELETE = route<{ id: string; studentId: string }>(MATCH_ADMIN, async (_req, s, { id, studentId }) => {
  const r = await db.jdShortlist.deleteMany({ where: { jdId: id, studentId, collegeId: s.collegeId } });
  if (r.count === 0) throw notFound("Not on the shortlist");
  await audit(s, { action: "jd.unshortlist", entity: "JobDescription", entityId: id, after: { studentId } });
  return { ok: true };
});
