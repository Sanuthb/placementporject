import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { RES_STAFF, resourceOf } from "@/lib/resourceService";
import { nextStatus, type Action, type Status } from "@/lib/resources";
import { notifyStaff } from "@/lib/notify";

/** Moves a resource through the workflow: SUBMIT for review, APPROVE or REJECT (admin only, reject needs a reason), ARCHIVE, RESTORE. */
export const POST = route<{ id: string }>(RES_STAFF, async (req, s, { id }) => {
  const r = await resourceOf(s.collegeId, id);
  const { action, note } = await parseBody(req, z.object({ action: z.enum(["SUBMIT", "APPROVE", "REJECT", "ARCHIVE", "RESTORE"]), note: z.string().trim().max(1000).optional() }));
  if (action === "SUBMIT" && !r.filePath && !r.url) throw badRequest("Add a file or a link before sending it for review");
  const next = nextStatus(r.status as Status, action as Action, s.role, note);
  if ("error" in next) throw badRequest(next.error);
  const review = action === "APPROVE" || action === "REJECT" ? { reviewedById: s.userId, reviewedAt: new Date(), reviewNote: note ?? null } : action === "SUBMIT" ? { reviewNote: null } : {};
  const u = await db.prepResource.update({ where: { id }, data: { status: next.status, ...review } });
  if (action === "SUBMIT") await notifyStaff(s.collegeId, { type: "resource.review", title: `Resource waiting for review: ${r.title}`, link: "/staff/resources", roles: ["TPO_ADMIN"], excludeUserId: s.userId });
  await audit(s, { action: `resource.${action.toLowerCase()}`, entity: "PrepResource", entityId: id, before: { status: r.status }, after: { status: u.status }, reason: note });
  return u;
});
