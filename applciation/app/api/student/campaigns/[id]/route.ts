import { studentRoute } from "@/lib/api/studentHandler";
import { db } from "@/lib/db";
import { notFound } from "@/lib/api/errors";
import { memberProgress } from "@/lib/campaign";
import { configOf, syncProgress } from "@/lib/campaignService";
import { jdData, publicView } from "@/lib/jd";

/**
 * My campaign: the company and job, the preparation details, my skill gap report, my day-by-day plan with progress, the mock tests and interviews, my support request.
 * Only my own plan and report; nothing about other students.
 */
export const GET = studentRoute<{ id: string }>({ module: "DRIVES" }, async (_req, me, { id }) => {
  const m = await db.campaignMember.findFirst({ where: { campaignId: id, studentId: me.studentId, status: { in: ["INVITED", "ACCEPTED", "DECLINED"] }, campaign: { status: { in: ["ACTIVE", "COMPLETED"] } } }, include: { campaign: true } });
  if (!m) throw notFound("Campaign not found");
  if (m.status === "ACCEPTED") await syncProgress(id);
  const c = m.campaign, cfg = configOf(c);
  const [items, jd, trainers, schedules, group] = await Promise.all([
    db.campaignPlanItem.findMany({ where: { memberId: m.id }, orderBy: [{ day: "asc" }, { createdAt: "asc" }] }),
    db.jobDescription.findUnique({ where: { id: c.jdId }, select: { data: true } }),
    db.user.findMany({ where: { id: { in: c.trainerIds } }, select: { name: true } }),
    cfg.mockTests.length ? db.assessmentSchedule.findMany({ where: { id: { in: cfg.mockTests.map((t) => t.scheduleId) }, collegeId: me.collegeId }, select: { id: true, startsAt: true, endsAt: true } }) : [],
    m.groupId ? db.campaignGroup.findUnique({ where: { id: m.groupId }, select: { name: true } }) : null,
  ]);
  const parsed = jd ? jdData.safeParse(jd.data) : null;
  return {
    id: c.id, name: c.name, company: c.company, jobRole: c.jobRole, description: c.description, startsAt: c.startsAt, deadline: c.deadline, campaignStatus: c.status, trainers: trainers.map((t) => t.name), group: group?.name ?? null,
    status: m.status, invitedAt: m.invitedAt, declineReason: m.declineReason, job: parsed?.success ? publicView(parsed.data) : null, gapReport: m.gapReport, progress: memberProgress(items), items,
    mockTests: cfg.mockTests.map((t) => ({ title: t.title, date: t.date, window: schedules.find((x) => x.id === t.scheduleId) ?? null })), mockInterviews: cfg.mockInterviews, milestones: cfg.milestones,
    help: m.helpRequestedAt ? { note: m.helpNote, at: m.helpRequestedAt, response: m.helpResponse, respondedAt: m.helpRespondedAt } : null,
  };
});
