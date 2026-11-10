import { route } from "@/lib/api/handler";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { CAMP_TRAINER, approvedJdFor, assertEditable, campaignOf, itemRows, logEvent, memberOf, planFor } from "@/lib/campaignService";

/**
 * Make the plan again from how the student matches the job now. Items already done are kept; items the student has not done and nobody edited are replaced; items a person added
 * or changed stay. Use it when the student has moved on, or the campaign's tests and interviews changed.
 */
export const POST = route<{ id: string; mid: string }>(CAMP_TRAINER, async (_req, s, { id, mid }) => {
  const c = await campaignOf(s, id);
  assertEditable(c);
  const m = await memberOf(id, mid);
  if (m.status === "REMOVED" || m.status === "DECLINED") throw badRequest("This student is not taking part");
  const { data } = await approvedJdFor(c);
  const { drafts } = await planFor(c, data, m.studentId);
  const kept = await db.campaignPlanItem.findMany({ where: { memberId: mid, OR: [{ status: { not: "PENDING" } }, { source: { not: "PLANNER" } }] }, select: { title: true } });
  const have = new Set(kept.map((k) => k.title));
  const fresh = drafts.filter((d) => !have.has(d.title));
  await db.$transaction([db.campaignPlanItem.deleteMany({ where: { memberId: mid, status: "PENDING", source: "PLANNER" } }), db.campaignPlanItem.createMany({ data: itemRows(id, mid, fresh) })]);
  await logEvent(id, { type: "STAFF", id: s.userId }, "plan.regenerated", { items: fresh.length }, mid);
  return { items: fresh.length };
});
