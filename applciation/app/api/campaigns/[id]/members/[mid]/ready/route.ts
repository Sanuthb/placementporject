import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { CAMP_TRAINER, campaignOf, logEvent, memberOf } from "@/lib/campaignService";

/** Mark a student ready for the final interview, or take the mark off. This is a person's judgement; the dashboard also shows who the plan says is ready. */
export const POST = route<{ id: string; mid: string }>(CAMP_TRAINER, async (req, s, { id, mid }) => {
  await campaignOf(s, id);
  await memberOf(id, mid);
  const { ready } = await parseBody(req, z.object({ ready: z.boolean() }));
  await db.campaignMember.update({ where: { id: mid }, data: ready ? { readyMarkedAt: new Date(), readyMarkedById: s.userId } : { readyMarkedAt: null, readyMarkedById: null } });
  await logEvent(id, { type: "STAFF", id: s.userId }, ready ? "member.marked_ready" : "member.unmarked_ready", {}, mid);
  return { ok: true };
});
