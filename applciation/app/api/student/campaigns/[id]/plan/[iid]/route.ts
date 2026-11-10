import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { logEvent } from "@/lib/campaignService";

const MANUAL = ["LEARN", "PRACTICE", "REVISION"];

/**
 * Tick off (or untick) a study, practice or revision item. Courses, study material, mock tests and mock interviews tick themselves when you finish them in the
 * places where you do them, so they cannot be ticked here.
 */
export const POST = studentRoute<{ id: string; iid: string }>({ module: "DRIVES", limit: { name: "campaign-plan", max: 300, windowSec: 3600 } }, async (req, me, { id, iid }) => {
  const it = await db.campaignPlanItem.findFirst({ where: { id: iid, campaignId: id, member: { studentId: me.studentId, status: "ACCEPTED" }, campaign: { status: "ACTIVE" } } });
  if (!it) throw notFound("Plan item not found");
  const { done } = await parseBody(req, z.object({ done: z.boolean() }));
  if (!MANUAL.includes(it.kind)) throw badRequest("This item ticks itself when you finish it. Open it and complete it there");
  await db.campaignPlanItem.update({ where: { id: iid }, data: done ? { status: "DONE", doneAt: new Date(), autoDone: false } : { status: "PENDING", doneAt: null } });
  if (done) await db.campaignMember.updateMany({ where: { id: it.memberId, startedAt: null }, data: { startedAt: new Date() } });
  await logEvent(id, { type: "STUDENT", id: me.studentId }, done ? "plan.item_done" : "plan.item_undone", { item: it.title }, it.memberId);
  return { ok: true };
});
