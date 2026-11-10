import { z } from "zod";
import { db } from "@/lib/db";
import type { ModuleKey, Prisma, PrepCampaign, Role } from "@/generated/prisma/client";
import { badRequest, notFound } from "@/lib/api/errors";
import { hasRole, type Session } from "@/lib/auth/session";
import { notifyStudent } from "@/lib/notify";
import { escapeHtml, fromAddress, mailer } from "@/lib/mailer";
import { draftPlan, dashboardOf, interviewCounts, interviewKindOf, memberProgress, type PlanDraft, type PrepRef } from "@/lib/campaign";
import { jdData, type JdData } from "@/lib/jd";
import { matchStudent, type MatchResult } from "@/lib/matching";
import { prepFor } from "@/lib/matchingService";
import { buildMaster } from "@/lib/resumeEngine";
import { loadInputsMany, loadMaster } from "@/lib/resumeService";

export const CAMP_ADMIN: { roles: Role[]; module: ModuleKey } = { roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" };
export const CAMP_TRAINER = { module: "DRIVES" as ModuleKey, facultyOk: true };
export const isStaff = (s: Session) => hasRole(s, "TPO_ADMIN", "PLACEMENT_OFFICER");

export const configSchema = z.object({
  mockTests: z.array(z.object({ scheduleId: z.uuid(), title: z.string().trim().min(2).max(150), date: z.string().nullable().default(null), kind: z.enum(["APTITUDE", "TECHNICAL", "OTHER"]).default("OTHER") })).max(10).default([]),
  mockInterviews: z.array(z.object({ title: z.string().trim().min(2).max(150), date: z.string().nullable().default(null), kind: z.enum(["TECHNICAL", "HR"]) })).max(10).default([]),
  resourceIds: z.array(z.uuid()).max(30).default([]),
  milestones: z.array(z.object({ title: z.string().trim().min(2).max(150), dueAt: z.string() })).max(20).default([]),
  notify: z.object({ email: z.boolean().default(false), remindBehind: z.boolean().default(true) }).default({ email: false, remindBehind: true }),
});
export type CampaignConfig = z.infer<typeof configSchema>;
export const configOf = (c: { config: unknown }): CampaignConfig => configSchema.parse(c.config ?? {});

/** A campaign the person may work on: placement staff any in the college; a trainer only the ones they are assigned to. */
export async function campaignOf(s: Session, id: string) {
  const c = await db.prepCampaign.findFirst({ where: { id, collegeId: s.collegeId, ...(isStaff(s) ? {} : { trainerIds: { has: s.userId } }) } });
  if (!c) throw notFound("Campaign not found");
  return c;
}
export const memberOf = async (campaignId: string, memberId: string) => {
  const m = await db.campaignMember.findFirst({ where: { id: memberId, campaignId } });
  if (!m) throw notFound("Candidate not found in this campaign");
  return m;
};

export async function logEvent(campaignId: string, actor: { type: "STAFF" | "STUDENT" | "SYSTEM"; id?: string | null }, action: string, detail: Record<string, unknown> = {}, memberId?: string | null, tx: Prisma.TransactionClient | typeof db = db) {
  await tx.campaignEvent.create({ data: { campaignId, memberId: memberId ?? null, actorType: actor.type, actorId: actor.id ?? null, action, detail: detail as Prisma.InputJsonValue } });
}

export async function approvedJdFor(c: Pick<PrepCampaign, "jdId" | "collegeId">) {
  const j = await db.jobDescription.findFirst({ where: { id: c.jdId, collegeId: c.collegeId } });
  if (!j) throw notFound("Job description not found");
  return { jd: j, data: jdData.parse(j.data) as JdData };
}

const gapOf = (res: MatchResult, data: JdData) => res.requirements.filter((r) => r.kind === "SKILL" && (r.status === "MISSING" || r.status === "PARTIAL")).map((r) => ({ skill: r.text, status: r.status as "MISSING" | "PARTIAL", mandatory: r.level === "MANDATORY", weight: data.requirements.find((x) => x.id === r.id)?.weight ?? 5 }));
export const reportOf = (res: MatchResult) => ({ score: res.score, mandatory: res.mandatory, skills: res.skills, explanation: res.explanation, parameters: res.parameters.map((p) => ({ label: p.label, weight: p.weight, value: p.value, note: p.note })), at: new Date().toISOString() });

/** The plan for one student, made from how they match the job now, what the college offers for each gap, and what the campaign scheduled. */
export async function planFor(c: PrepCampaign, data: JdData, studentId: string): Promise<{ drafts: PlanDraft[]; report: ReturnType<typeof reportOf> }> {
  const res = matchStudent(data, await loadMaster(c.collegeId, studentId));
  const gaps = gapOf(res, data);
  const cfg = configOf(c);
  const prep: Record<string, PrepRef> = {};
  for (const p of await prepFor(c.collegeId, gaps.map((g) => g.skill))) prep[p.skill] = { course: p.courses[0], resource: p.resources[0] };
  const resources = cfg.resourceIds.length ? await db.prepResource.findMany({ where: { id: { in: cfg.resourceIds }, collegeId: c.collegeId, status: "APPROVED" }, select: { id: true, title: true } }) : [];
  const val = (k: string) => res.parameters.find((p) => p.key === k)?.value ?? 1;
  const drafts = draftPlan({ startsAt: c.startsAt, deadline: c.deadline, gaps, prep, weak: { aptitude: val("aptitude") < 0.6, communication: val("communication") < 0.6 }, mockTests: cfg.mockTests, mockInterviews: cfg.mockInterviews, resources, jobRole: c.jobRole });
  return { drafts, report: reportOf(res) };
}

export const itemRows = (campaignId: string, memberId: string, drafts: PlanDraft[], source = "PLANNER") => drafts.map((d) => ({ campaignId, memberId, day: d.day, dueAt: d.dueAt, kind: d.kind, title: d.title, detail: d.detail ?? null, skill: d.skill ?? null, refType: d.refType ?? null, refId: d.refId ?? null, optional: !!d.optional, source }));

/**
 * Invites selected students: each gets a fresh skill gap report and a personal plan, is marked invited and told. Students already invited are skipped. If the campaign
 * allows email and the student takes emails, they also get one (a failure to send never stops the invitation).
 */
export async function inviteMembers(c: PrepCampaign, memberIds: string[], actor: { id: string }) {
  const { data } = await approvedJdFor(c);
  const members = await db.campaignMember.findMany({ where: { campaignId: c.id, status: "SELECTED", ...(memberIds.length ? { id: { in: memberIds } } : {}) }, include: { student: { select: { id: true, name: true, email: true, emailAnnouncements: true } }, items: { select: { id: true }, take: 1 } } });
  const cfg = configOf(c);
  let sent = 0;
  for (const m of members) {
    const { drafts, report } = await planFor(c, data, m.studentId);
    await db.$transaction(async (tx) => {
      const claim = await tx.campaignMember.updateMany({ where: { id: m.id, status: "SELECTED" }, data: { status: "INVITED", invitedAt: new Date(), gapReport: report as Prisma.InputJsonValue, scoreAtAdd: report.score } });
      if (claim.count === 0) return;
      if (!m.items.length) await tx.campaignPlanItem.createMany({ data: itemRows(c.id, m.id, drafts) });
      await logEvent(c.id, { type: "STAFF", id: actor.id }, "member.invited", { score: report.score, items: drafts.length }, m.id, tx);
      await notifyStudent(c.collegeId, m.studentId, { type: "campaign.invited", title: `You are invited to prepare for ${c.jobRole} at ${c.company}`, body: "See your skill gap report and your preparation plan, then accept or decline.", link: `/student/campaigns/${c.id}` }, tx);
      sent++;
    });
    if (cfg.notify.email && m.student.emailAnnouncements) {
      try { await mailer().sendMail({ from: fromAddress(), to: m.student.email, subject: `Preparation invitation: ${c.jobRole} at ${c.company}`, html: `<p>Hello ${escapeHtml(m.student.name)},</p><p>Your placement office invites you to prepare for <b>${escapeHtml(c.jobRole)}</b> at <b>${escapeHtml(c.company)}</b>. Sign in to see your plan and accept the invitation.</p>` }); } catch { /* the in-app invitation stands */ }
    }
  }
  return { invited: sent, skipped: members.length - sent };
}

/**
 * Brings plan items up to date from what students did elsewhere: a finished course, completed study material, a submitted mock test, a completed mock interview.
 * Only ever marks items done; a person's own tick is never undone. Also records when each student started.
 */
export async function syncProgress(campaignId: string) {
  const items = await db.campaignPlanItem.findMany({ where: { campaignId, status: "PENDING", refType: { not: null }, member: { status: { in: ["INVITED", "ACCEPTED"] } } }, include: { member: { select: { studentId: true } } } });
  if (!items.length) return 0;
  const sid = [...new Set(items.map((i) => i.member.studentId))];
  const ref = (t: string) => [...new Set(items.filter((i) => i.refType === t && i.refId).map((i) => i.refId!))];
  const [courses, resources, attempts, interviews] = await Promise.all([
    ref("COURSE").length ? db.courseEnrolment.findMany({ where: { studentId: { in: sid }, courseId: { in: ref("COURSE") }, status: "COMPLETED" }, select: { studentId: true, courseId: true, completedAt: true } }) : [],
    ref("RESOURCE").length ? db.resourceProgress.findMany({ where: { studentId: { in: sid }, resourceId: { in: ref("RESOURCE") }, completedAt: { not: null } }, select: { studentId: true, resourceId: true, completedAt: true } }) : [],
    ref("ASSESSMENT").length ? db.assessmentAttempt.findMany({ where: { studentId: { in: sid }, scheduleId: { in: ref("ASSESSMENT") }, status: { not: "IN_PROGRESS" } }, select: { studentId: true, scheduleId: true, submittedAt: true } }) : [],
    items.some((i) => i.refType === "MOCK_INTERVIEW") ? db.mockInterview.findMany({ where: { studentId: { in: sid }, status: "COMPLETED" }, select: { studentId: true, topic: true, createdAt: true, completedAt: true } }) : [],
  ]);
  let changed = 0;
  const firstDone = new Map<string, Date>();
  for (const i of items) {
    const st = i.member.studentId;
    let at: Date | null = null;
    if (i.refType === "COURSE") at = courses.find((x) => x.studentId === st && x.courseId === i.refId)?.completedAt ?? (courses.some((x) => x.studentId === st && x.courseId === i.refId) ? new Date() : null);
    else if (i.refType === "RESOURCE") at = resources.find((x) => x.studentId === st && x.resourceId === i.refId)?.completedAt ?? null;
    else if (i.refType === "ASSESSMENT") { const a = attempts.find((x) => x.studentId === st && x.scheduleId === i.refId); at = a ? (a.submittedAt ?? new Date()) : null; }
    else if (i.refType === "MOCK_INTERVIEW") { const kind = interviewKindOf(i.detail); const m = interviews.find((x) => x.studentId === st && interviewCounts(x.topic, x.createdAt, i.createdAt, kind)); at = m ? (m.completedAt ?? new Date()) : null; }
    if (!at) continue;
    await db.campaignPlanItem.updateMany({ where: { id: i.id, status: "PENDING" }, data: { status: "DONE", doneAt: at, autoDone: true } });
    changed++;
    const prev = firstDone.get(i.memberId);
    if (!prev || at < prev) firstDone.set(i.memberId, at);
  }
  for (const [memberId, at] of firstDone) await db.campaignMember.updateMany({ where: { id: memberId, startedAt: null }, data: { startedAt: at } });
  return changed;
}

/** The dashboard: figures, and one row per student with progress, whether they are behind, who needs help, and the match score at invitation against now. */
export async function dashboard(c: PrepCampaign) {
  await syncProgress(c.id);
  const members = await db.campaignMember.findMany({ where: { campaignId: c.id }, orderBy: { createdAt: "asc" }, include: { student: { select: { id: true, name: true, enrollmentNo: true, department: { select: { name: true } } } }, items: { select: { id: true, kind: true, status: true, dueAt: true, optional: true } }, group: { select: { name: true } } } });
  const now = new Date();
  const figures = dashboardOf(members.map((m) => ({ status: m.status, startedAt: m.startedAt, helpOpen: !!m.helpRequestedAt && !m.helpRespondedAt, markedReady: !!m.readyMarkedAt, items: m.items, groupId: m.groupId })), now);
  // the match score now, for students who were invited (so the campaign's effect can be seen)
  const { data } = await approvedJdFor(c);
  const live = members.filter((m) => m.status === "INVITED" || m.status === "ACCEPTED").slice(0, 300);
  const nowScore = new Map<string, number>();
  if (live.length) {
    const inputs = await loadInputsMany(c.collegeId, live.map((m) => m.studentId));
    for (const m of live) { const i = inputs.get(m.studentId); if (i) nowScore.set(m.id, matchStudent(data, buildMaster(i)).score); }
  }
  const rows = members.map((m) => {
    const p = memberProgress(m.items, now);
    return { id: m.id, studentId: m.studentId, name: m.student.name, enrollmentNo: m.student.enrollmentNo, department: m.student.department.name, group: m.group?.name ?? null, groupId: m.groupId, status: m.status, addedManually: m.addedManually, progress: p, helpOpen: !!m.helpRequestedAt && !m.helpRespondedAt, helpNote: m.helpNote, ready: !!m.readyMarkedAt || p.ready, markedReady: !!m.readyMarkedAt, scoreThen: m.scoreAtAdd, scoreNow: nowScore.get(m.id) ?? null, declineReason: m.declineReason };
  });
  const gained = rows.filter((r) => r.scoreThen !== null && r.scoreNow !== null);
  return { figures: { ...figures, averageScoreChange: gained.length ? Math.round(gained.reduce((a, r) => a + (r.scoreNow! - r.scoreThen!), 0) / gained.length) : null }, members: rows };
}

/** A nudge to students who are behind, at most once a day each. */
export async function remindBehind(c: PrepCampaign, actorId: string) {
  const d = await dashboard(c);
  const since = new Date(Date.now() - 20 * 3_600_000);
  let sent = 0;
  for (const m of d.members.filter((x) => x.status === "ACCEPTED" && x.progress.behind)) {
    if (await db.campaignEvent.findFirst({ where: { campaignId: c.id, memberId: m.id, action: "member.reminded", createdAt: { gt: since } }, select: { id: true } })) continue;
    await notifyStudent(c.collegeId, m.studentId, { type: "campaign.reminder", title: `Your preparation for ${c.jobRole} at ${c.company} needs attention`, body: `${m.progress.overdue} item${m.progress.overdue === 1 ? " is" : "s are"} past due. Open your plan to catch up, or ask for support.`, link: `/student/campaigns/${c.id}` });
    await logEvent(c.id, { type: "STAFF", id: actorId }, "member.reminded", { overdue: m.progress.overdue }, m.id);
    sent++;
  }
  return { reminded: sent };
}

export function assertEditable(c: PrepCampaign) {
  if (c.status === "COMPLETED" || c.status === "CANCELLED") throw badRequest("This campaign is over and can no longer change");
}
