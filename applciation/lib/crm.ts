import { db } from "@/lib/db";

/** Notifies each prospect's owner once per due follow-up date. Safe to run repeatedly. */
export async function sendFollowUpReminders(collegeId?: string, now = new Date()) {
  const due = await db.prospect.findMany({
    where: { ...(collegeId ? { collegeId } : {}), nextFollowUpAt: { lte: now }, stage: { notIn: ["WON", "LOST"] } },
    select: { id: true, collegeId: true, ownerId: true, companyName: true, nextFollowUpAt: true, lastReminderAt: true },
  });
  const fresh = due.filter((p) => !p.lastReminderAt || p.lastReminderAt < p.nextFollowUpAt!);
  let sent = 0;
  for (const p of fresh) {
    const claim = await db.prospect.updateMany({ where: { id: p.id, lastReminderAt: p.lastReminderAt }, data: { lastReminderAt: now } });
    if (claim.count === 0) continue;
    await db.notification.create({ data: { collegeId: p.collegeId, userId: p.ownerId, type: "crm.followUp", title: `Follow up with ${p.companyName}`, link: `/crm/prospects/${p.id}` } });
    sent++;
  }
  return { due: fresh.length, reminded: sent };
}
