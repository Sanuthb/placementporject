import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { CAMP_TRAINER, campaignOf } from "@/lib/campaignService";

/** Every change in the campaign, newest first, with who made it. */
export const GET = route<{ id: string }>(CAMP_TRAINER, async (_req, s, { id }) => {
  await campaignOf(s, id);
  const ev = await db.campaignEvent.findMany({ where: { campaignId: id }, orderBy: { createdAt: "desc" }, take: 300 });
  const users = await db.user.findMany({ where: { id: { in: [...new Set(ev.flatMap((e) => (e.actorType === "STAFF" && e.actorId ? [e.actorId] : [])))] } }, select: { id: true, name: true } });
  const studs = await db.student.findMany({ where: { id: { in: [...new Set(ev.flatMap((e) => (e.actorType === "STUDENT" && e.actorId ? [e.actorId] : [])))] } }, select: { id: true, name: true } });
  const members = await db.campaignMember.findMany({ where: { id: { in: [...new Set(ev.flatMap((e) => (e.memberId ? [e.memberId] : [])))] } }, select: { id: true, student: { select: { name: true } } } });
  return ev.map((e) => ({ id: e.id, action: e.action, detail: e.detail, at: e.createdAt, by: e.actorType === "SYSTEM" ? "System" : e.actorType === "STAFF" ? (users.find((u) => u.id === e.actorId)?.name ?? "Staff") : (studs.find((x) => x.id === e.actorId)?.name ?? "Student"), student: members.find((m) => m.id === e.memberId)?.student.name ?? null }));
});
