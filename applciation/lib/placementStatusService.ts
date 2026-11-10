import { db } from "@/lib/db";
import { placementStatus, type Facts, type Status } from "@/lib/placementStatus";

/**
 * Works out the placement status of applications from the records the platform keeps. `staff` names are real; for a student's own view they are replaced by
 * "Placement office" so staff names are not exposed in the student app.
 */
export type Filter = { collegeId: string; driveId?: string; studentId?: string; applicationIds?: string[] };
type Out = { applicationId: string; studentId: string; driveId: string; status: Status };

const ROUND_NAME: Record<string, string> = { APTITUDE: "Aptitude", CODING: "Coding", GROUP_DISCUSSION: "Group discussion", TECHNICAL: "Technical interview", HR: "HR interview", OTHER: "Round" };

export async function statusesFor(f: Filter, audience: "staff" | "student"): Promise<Out[]> {
  const apps = await db.application.findMany({
    where: { collegeId: f.collegeId, ...(f.driveId ? { driveId: f.driveId } : {}), ...(f.studentId ? { studentId: f.studentId } : {}), ...(f.applicationIds ? { id: { in: f.applicationIds } } : {}) },
    include: { drive: { select: { publishedAt: true, status: true, rounds: { select: { id: true, name: true, type: true } } } }, events: { orderBy: { createdAt: "asc" } }, results: true, slots: true, offers: { orderBy: { offeredAt: "desc" } } },
    take: 3000,
  });
  if (!apps.length) return [];
  const driveIds = [...new Set(apps.map((a) => a.driveId))], studentIds = [...new Set(apps.map((a) => a.studentId))];
  const jds = await db.jobDescription.findMany({ where: { collegeId: f.collegeId, driveId: { in: driveIds } }, select: { id: true, driveId: true } });
  const jdOfDrive = new Map(jds.map((j) => [j.driveId!, j.id]));
  const jdIds = jds.map((j) => j.id);
  const [members, plan, attempts, interviews] = jdIds.length ? await Promise.all([
    db.campaignMember.findMany({ where: { studentId: { in: studentIds }, status: { in: ["INVITED", "ACCEPTED"] }, campaign: { jdId: { in: jdIds }, collegeId: f.collegeId } }, select: { studentId: true, invitedAt: true, createdAt: true, campaign: { select: { jdId: true } } } }),
    db.campaignPlanItem.findMany({ where: { status: "DONE", refType: { in: ["ASSESSMENT", "MOCK_INTERVIEW"] }, doneAt: { not: null }, member: { studentId: { in: studentIds }, campaign: { jdId: { in: jdIds }, collegeId: f.collegeId } } }, select: { title: true, refType: true, doneAt: true, member: { select: { studentId: true, campaign: { select: { jdId: true } } } } } }),
    db.assessmentAttempt.findMany({ where: { studentId: { in: studentIds }, status: { not: "IN_PROGRESS" }, reviewStatus: { not: "PENDING" }, schedule: { collegeId: f.collegeId, paper: { jdId: { in: jdIds } } } }, select: { studentId: true, submittedAt: true, schedule: { select: { title: true, paper: { select: { jdId: true } } } } } }),
    db.mockInterview.findMany({ where: { studentId: { in: studentIds }, status: "COMPLETED", jdId: { in: jdIds } }, select: { studentId: true, jdId: true, completedAt: true, role: true } }),
  ]) : [[], [], [], []] as [never[], never[], never[], never[]];
  const actorIds = new Set<string>();
  for (const a of apps) { a.events.forEach((e) => e.actorId && actorIds.add(e.actorId)); a.results.forEach((r) => r.recordedById && actorIds.add(r.recordedById)); a.slots.forEach((s) => actorIds.add(s.createdById)); a.offers.forEach((o) => actorIds.add(o.createdById)); }
  const names = new Map((actorIds.size ? await db.user.findMany({ where: { id: { in: [...actorIds] }, collegeId: f.collegeId }, select: { id: true, name: true } }) : []).map((u) => [u.id, u.name]));
  const who = (id: string | null | undefined) => (!id ? null : audience === "student" ? (names.has(id) ? "Placement office" : null) : names.get(id) ?? null);

  return apps.map((a) => {
    const jdId = jdOfDrive.get(a.driveId) ?? null, rounds = new Map(a.drive.rounds.map((r) => [r.id, r]));
    const roundName = (id: string | null) => { const r = id ? rounds.get(id) : null; return r ? r.name ?? ROUND_NAME[r.type] : null; };
    const first = a.events.find((e) => e.status === "APPLIED");
    const mine = <T extends { studentId?: string; member?: { studentId: string; campaign: { jdId: string } }; jdId?: string | null }>(x: T) => (x.studentId ?? x.member?.studentId) === a.studentId;
    const prep = members.filter((m) => m.studentId === a.studentId && m.campaign.jdId === jdId).sort((x, y) => +(x.invitedAt ?? x.createdAt) - +(y.invitedAt ?? y.createdAt))[0];
    const doneItems = plan.filter((p) => mine(p) && p.member.campaign.jdId === jdId);
    const offer = a.offers.find((o) => o.status !== "REVOKED") ?? a.offers[0] ?? null;
    const facts: Facts = {
      drive: { publishedAt: a.drive.publishedAt, status: a.drive.status },
      application: { appliedAt: a.appliedAt, status: a.status, clearedAllRounds: a.clearedAllRounds, appliedBy: first?.note?.startsWith("Applied on behalf") ? who(first.actorId) ?? "Placement office" : null },
      events: a.events.map((e) => ({ at: e.createdAt, status: e.status, roundResult: e.roundResult, roundName: roundName(e.roundId), by: who(e.actorId), note: e.note && e.note !== "Attendance" ? e.note : null })),
      prep: prep ? { at: prep.invitedAt ?? prep.createdAt, by: null } : null,
      tests: [...attempts.filter((t) => mine(t) && t.schedule.paper.jdId === jdId).map((t) => ({ at: t.submittedAt ?? a.appliedAt, title: t.schedule.title })), ...doneItems.filter((p) => p.refType === "ASSESSMENT").map((p) => ({ at: p.doneAt!, title: p.title }))],
      interviews: [...interviews.filter((i) => mine(i) && i.jdId === jdId).map((i) => ({ at: i.completedAt ?? a.appliedAt, title: i.role })), ...doneItems.filter((p) => p.refType === "MOCK_INTERVIEW").map((p) => ({ at: p.doneAt!, title: p.title }))],
      slots: a.slots.map((s) => ({ createdAt: s.updatedAt, startsAt: s.startsAt, status: s.status, roundName: roundName(s.roundId), by: who(s.createdById) })),
      results: a.results.map((r) => ({ at: r.updatedAt, status: r.status, roundType: rounds.get(r.roundId)?.type ?? "OTHER", roundName: roundName(r.roundId), by: who(r.recordedById) })),
      offer: offer ? { offeredAt: offer.offeredAt, offeredBy: who(offer.createdById), status: offer.status, respondedAt: offer.respondedAt, joiningStatus: offer.joiningStatus, joinedAt: offer.joiningDate } : null,
    };
    return { applicationId: a.id, studentId: a.studentId, driveId: a.driveId, status: placementStatus(facts) };
  });
}
