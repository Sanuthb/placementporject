import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { CAMP_ADMIN, assertEditable, campaignOf, logEvent } from "@/lib/campaignService";

/** Add a group, with an optional trainer. Candidates are moved into groups from their row. */
export const POST = route<{ id: string }>(CAMP_ADMIN, async (req, s, { id }) => {
  const c = await campaignOf(s, id);
  assertEditable(c);
  const b = await parseBody(req, z.object({ name: z.string().trim().min(2).max(80), trainerId: z.uuid().nullish() }));
  const last = await db.campaignGroup.aggregate({ where: { campaignId: id }, _max: { sortOrder: true } });
  const g = await db.campaignGroup.create({ data: { campaignId: id, name: b.name, trainerId: b.trainerId ?? null, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
  await logEvent(id, { type: "STAFF", id: s.userId }, "group.created", { name: b.name });
  return g;
});
