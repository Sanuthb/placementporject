import { route } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { RES_STAFF } from "@/lib/resourceService";

/** Removes an assignment. Students keep their own progress and feedback. */
export const DELETE = route<{ id: string; aid: string }>(RES_STAFF, async (_req, s, { id, aid }) => {
  const r = await db.resourceAssignment.deleteMany({ where: { id: aid, resourceId: id, collegeId: s.collegeId } });
  if (r.count === 0) throw notFound("Assignment not found");
  await audit(s, { action: "resource.unassign", entity: "PrepResource", entityId: id, after: { assignmentId: aid } });
  return { ok: true };
});
