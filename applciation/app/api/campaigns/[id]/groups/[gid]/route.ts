import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { CAMP_ADMIN, campaignOf, logEvent } from "@/lib/campaignService";

type P = { id: string; gid: string };
export const PATCH = route<P>(CAMP_ADMIN, async (req, s, { id, gid }) => {
  await campaignOf(s, id);
  const b = await parseBody(req, z.object({ name: z.string().trim().min(2).max(80).optional(), trainerId: z.uuid().nullish() }));
  const r = await db.campaignGroup.updateMany({ where: { id: gid, campaignId: id }, data: { ...(b.name ? { name: b.name } : {}), ...(b.trainerId !== undefined ? { trainerId: b.trainerId } : {}) } });
  if (r.count === 0) throw notFound("Group not found");
  await logEvent(id, { type: "STAFF", id: s.userId }, "group.updated", { gid });
  return { ok: true };
});
/** Delete a group; its candidates stay in the campaign, ungrouped. */
export const DELETE = route<P>(CAMP_ADMIN, async (_req, s, { id, gid }) => {
  await campaignOf(s, id);
  const r = await db.campaignGroup.deleteMany({ where: { id: gid, campaignId: id } });
  if (r.count === 0) throw notFound("Group not found");
  await logEvent(id, { type: "STAFF", id: s.userId }, "group.deleted", { gid });
  return { ok: true };
});
