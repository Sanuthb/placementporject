import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyStudent } from "@/lib/notify";
import { CAMP_ADMIN, CAMP_TRAINER, assertEditable, campaignOf, logEvent, memberOf, syncProgress } from "@/lib/campaignService";
import { memberProgress, nextMember, type MemberStatus } from "@/lib/campaign";

type P = { id: string; mid: string };

/** One candidate: their skill gap report, plan with progress, support request and history. */
export const GET = route<P>(CAMP_TRAINER, async (_req, s, { id, mid }) => {
  await campaignOf(s, id);
  await memberOf(id, mid);
  await syncProgress(id);
  const m = await db.campaignMember.findUniqueOrThrow({ where: { id: mid }, include: { student: { select: { id: true, name: true, enrollmentNo: true, email: true, department: { select: { name: true } } } }, group: { select: { id: true, name: true } }, items: { orderBy: [{ day: "asc" }, { createdAt: "asc" }] } } });
  const events = await db.campaignEvent.findMany({ where: { campaignId: id, memberId: mid }, orderBy: { createdAt: "desc" }, take: 60 });
  return {
    id: m.id, status: m.status, student: m.student, group: m.group, addedManually: m.addedManually, gapReport: m.gapReport, invitedAt: m.invitedAt, respondedAt: m.respondedAt, declineReason: m.declineReason, startedAt: m.startedAt,
    help: m.helpRequestedAt ? { note: m.helpNote, at: m.helpRequestedAt, response: m.helpResponse, respondedAt: m.helpRespondedAt } : null, markedReady: !!m.readyMarkedAt, progress: memberProgress(m.items), items: m.items, events: events.map((e) => ({ action: e.action, detail: e.detail, at: e.createdAt, by: e.actorType })),
  };
});

const patch = z.object({ groupId: z.uuid().nullable() });
/** Move a candidate to another group (or out of all groups). */
export const PATCH = route<P>(CAMP_ADMIN, async (req, s, { id, mid }) => {
  const c = await campaignOf(s, id);
  assertEditable(c);
  await memberOf(id, mid);
  const { groupId } = await parseBody(req, patch);
  if (groupId && !(await db.campaignGroup.findFirst({ where: { id: groupId, campaignId: id }, select: { id: true } }))) throw badRequest("Group not found");
  await db.campaignMember.update({ where: { id: mid }, data: { groupId } });
  await logEvent(id, { type: "STAFF", id: s.userId }, "member.group_changed", { groupId }, mid);
  return { ok: true };
});

/** Remove a candidate from the campaign. Their history is kept; they are told if they had been invited. */
export const DELETE = route<P>(CAMP_ADMIN, async (_req, s, { id, mid }) => {
  const c = await campaignOf(s, id);
  assertEditable(c);
  const m = await memberOf(id, mid);
  const next = nextMember(m.status as MemberStatus, "REMOVE");
  if ("error" in next) throw badRequest(next.error);
  await db.campaignMember.update({ where: { id: mid }, data: { status: "REMOVED" } });
  if (m.status !== "SELECTED") await notifyStudent(s.collegeId, m.studentId, { type: "campaign.removed", title: `You were removed from the preparation campaign for ${c.jobRole} at ${c.company}`, link: "/student/campaigns" });
  await logEvent(id, { type: "STAFF", id: s.userId }, "member.removed", { was: m.status }, mid);
  await audit(s, { action: "campaign.remove_candidate", entity: "PrepCampaign", entityId: id, after: { memberId: mid } });
  return { ok: true };
});
