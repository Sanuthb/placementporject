import { db } from "@/lib/db";
import type { Session } from "@/lib/auth/session";
import { departmentScope } from "@/lib/auth/session";
import type { StudentSession } from "@/lib/auth/student";
import { studentEvents } from "@/lib/calendarService";
import { cleanEvaluation } from "@/lib/discussionEngine";
import { overview, placementYear } from "@/lib/analytics";
import { learningSummary } from "@/lib/lmsService";
import { careerFor } from "@/lib/readinessService";
import { BAND_LABEL } from "@/lib/readiness";
import { SCORED_CATEGORIES } from "@/lib/readiness";
import { modulesOf } from "@/lib/student360";

const DAY = 86_400_000;
const avg = (xs: number[], d = 1) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10 ** d) / 10 ** d : null);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const scoreOf = (f: unknown) => { const s = (f as { score?: unknown } | null)?.score; return typeof s === "number" ? s : null; };

/** What a student sees on the home page beyond the basics: readiness, today's tasks, roadmap, learning, skills, tests, interviews and campaigns. Parts for modules the college has not bought are left out. */
export async function studentHome(me: StudentSession, now = new Date()) {
  const mods = await modulesOf(me.collegeId);
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 330 * 60_000), dayEnd = new Date(dayStart.getTime() + DAY); // India day
  const [career, events, roadmap, enrols, resources, attempts, ivs, dss, camps] = await Promise.all([
    careerFor(me.collegeId, [me.studentId], "student").then((m) => m.get(me.studentId) ?? null),
    studentEvents(me, now),
    db.studentRoadmap.findUnique({ where: { studentId: me.studentId }, select: { id: true, targetRole: true } }),
    mods.has("LEARNING") ? db.courseEnrolment.findMany({ where: { studentId: me.studentId, status: { not: "WITHDRAWN" } }, orderBy: { lastActivityAt: "desc" }, take: 20, select: { status: true, course: { select: { id: true, title: true, lessons: { where: { required: true }, select: { id: true } } } }, progress: { select: { lessonId: true } } } }) : Promise.resolve([]),
    db.resourceProgress.count({ where: { studentId: me.studentId, completedAt: { not: null } } }),
    mods.has("ASSESSMENTS") ? db.assessmentAttempt.findMany({ where: { studentId: me.studentId, status: { not: "IN_PROGRESS" }, reviewStatus: { not: "PENDING" }, score: { not: null }, schedule: { collegeId: me.collegeId, isPractice: false, paper: { category: { in: [...SCORED_CATEGORIES] } } } }, orderBy: { submittedAt: "desc" }, take: 5, select: { score: true, maxScore: true, submittedAt: true, schedule: { select: { id: true, title: true } } } }) : Promise.resolve([]),
    db.mockInterview.findMany({ where: { studentId: me.studentId, status: "COMPLETED" }, orderBy: { completedAt: "desc" }, take: 5, select: { id: true, role: true, type: true, completedAt: true, feedback: true } }),
    db.discussionSession.findMany({ where: { studentId: me.studentId, status: "COMPLETED" }, orderBy: { completedAt: "desc" }, take: 5, select: { id: true, kind: true, topic: true, completedAt: true, feedback: true } }),
    db.campaignMember.findMany({ where: { studentId: me.studentId, status: { in: ["INVITED", "ACCEPTED"] }, campaign: { collegeId: me.collegeId, status: "ACTIVE" } }, select: { campaign: { select: { id: true, jobRole: true, company: true } }, items: { select: { status: true, dueAt: true, title: true, optional: true } } } }),
  ]);

  const today = events.filter((e) => (e.allDay ? e.start >= new Date(dayStart.getTime() - 0) && e.start < dayEnd : e.start >= dayStart && e.start < dayEnd)).map((e) => ({ title: e.title, kind: e.kind, at: e.start, link: e.link }));
  const overdue = camps.flatMap((c) => c.items.filter((i) => i.status === "PENDING" && !i.optional && i.dueAt < dayStart).map((i) => ({ title: i.title, campaign: `${c.campaign.jobRole} at ${c.campaign.company}`, dueAt: i.dueAt })));
  let road: { percent: number; done: number; total: number; overdue: number; next: { title: string; semester: number }[]; targetRole: string | null } | null = null;
  if (roadmap) {
    const ms = await db.roadmapMilestone.findMany({ where: { roadmapId: roadmap.id, archivedAt: null }, orderBy: [{ semester: "asc" }, { sortOrder: "asc" }], select: { title: true, semester: true, status: true } });
    const done = ms.filter((m) => m.status === "DONE").length, open = ms.filter((m) => m.status !== "DONE" && m.status !== "SKIPPED");
    road = { percent: pct(done, ms.length), done, total: ms.length, overdue: 0, next: open.slice(0, 3).map((m) => ({ title: m.title, semester: m.semester })), targetRole: roadmap.targetRole };
  }
  const courses = enrols.map((e) => { const need = e.course.lessons.length, done = e.progress.filter((p) => e.course.lessons.some((l) => l.id === p.lessonId)).length; return { id: e.course.id, title: e.course.title, percent: e.status === "COMPLETED" ? 100 : pct(done, need), completed: e.status === "COMPLETED" }; });
  const tests = attempts.map((a) => ({ id: a.schedule.id, title: a.schedule.title, percent: Number(a.maxScore) ? Math.round((Number(a.score) / Number(a.maxScore)) * 100) : 0, at: a.submittedAt }));
  const skillsPart = career?.components.find((c) => c.key === "skills");
  return {
    readiness: career && { score: career.score, band: career.band, bandLabel: BAND_LABEL[career.band], coverage: career.coverage, confidence: career.confidence, nextSteps: career.nextSteps.slice(0, 2), parts: career.components.map((c) => ({ key: c.key, label: c.label, value: c.value })) },
    today: { items: today.slice(0, 8), overdue: overdue.slice(0, 5) },
    roadmap: road,
    learning: mods.has("LEARNING") ? { courses: courses.slice(0, 5), inProgress: courses.filter((c) => !c.completed).length, completed: courses.filter((c) => c.completed).length, resourcesCompleted: resources } : null,
    skills: skillsPart ? { value: skillsPart.value, note: skillsPart.note } : null,
    tests: mods.has("ASSESSMENTS") ? { latest: tests, average: avg(tests.map((t) => t.percent)) } : null,
    interviews: { count: ivs.length, average: avg(ivs.flatMap((i) => scoreOf(i.feedback) ?? [])), latest: ivs.slice(0, 3).map((i) => ({ id: i.id, title: i.role, type: i.type, score: scoreOf(i.feedback), at: i.completedAt })) },
    discussions: { count: dss.length, average: avg(dss.flatMap((d) => cleanEvaluation(d.feedback, d.kind as never)?.score ?? [])), latest: dss.slice(0, 3).map((d) => ({ id: d.id, title: d.topic, kind: d.kind, score: cleanEvaluation(d.feedback, d.kind as never)?.score ?? null, at: d.completedAt })) },
    campaigns: camps.map((c) => { const req = c.items.filter((i) => !i.optional), done = req.filter((i) => i.status === "DONE").length, next = c.items.filter((i) => i.status === "PENDING").sort((a, b) => +a.dueAt - +b.dueAt)[0]; return { id: c.campaign.id, title: `${c.campaign.jobRole} at ${c.campaign.company}`, done, total: req.length, percent: pct(done, req.length), next: next ? { title: next.title, dueAt: next.dueAt } : null }; }),
  };
}

/** The placement office's view of preparation: job descriptions, matching, campaigns, mock results, interviews and discussions. Sections for modules the college has not bought are left out; a coordinator sees only their department's students. */
export async function preparationDashboard(s: Session, now = new Date()) {
  const mods = await modulesOf(s.collegeId);
  const sf = { student: { ...departmentScope(s) } };
  const since = new Date(now.getTime() - 90 * DAY);
  const [jds, shortlists, camps, members, attempts, ivs, dss, assignedIv, assignedDs] = await Promise.all([
    mods.has("DRIVES") ? db.jobDescription.groupBy({ by: ["status"], where: { collegeId: s.collegeId }, _count: true }) : Promise.resolve([]),
    mods.has("DRIVES") ? db.jdShortlist.count({ where: { jd: { collegeId: s.collegeId } } }) : Promise.resolve(0),
    mods.has("DRIVES") ? db.prepCampaign.groupBy({ by: ["status"], where: { collegeId: s.collegeId }, _count: true }) : Promise.resolve([]),
    mods.has("DRIVES") ? db.campaignMember.findMany({ where: { campaign: { collegeId: s.collegeId, status: "ACTIVE" }, ...sf }, select: { status: true, readyMarkedAt: true, items: { select: { status: true, dueAt: true, optional: true } } } }) : Promise.resolve([]),
    mods.has("ASSESSMENTS") ? db.assessmentAttempt.findMany({ where: { schedule: { collegeId: s.collegeId, isPractice: false }, status: { not: "IN_PROGRESS" }, reviewStatus: { not: "PENDING" }, score: { not: null }, submittedAt: { gte: since }, ...sf }, select: { score: true, maxScore: true, studentId: true, schedule: { select: { paper: { select: { passPercent: true } } } } }, take: 20000 }) : Promise.resolve([]),
    db.mockInterview.findMany({ where: { collegeId: s.collegeId, status: "COMPLETED", completedAt: { gte: since }, ...sf }, select: { feedback: true, assignmentId: true }, take: 20000 }),
    db.discussionSession.findMany({ where: { collegeId: s.collegeId, status: "COMPLETED", completedAt: { gte: since }, ...sf }, select: { feedback: true, kind: true, assignmentId: true }, take: 20000 }),
    db.interviewAssignment.count({ where: { collegeId: s.collegeId } }),
    db.discussionAssignment.count({ where: { collegeId: s.collegeId } }),
  ]);
  const n = (g: { status: string; _count: number }[], k: string) => g.find((x) => x.status === k)?._count ?? 0;
  const pcts = attempts.map((a) => (Number(a.maxScore) ? (Number(a.score) / Number(a.maxScore)) * 100 : 0));
  const passed = attempts.filter((a, i) => a.schedule.paper.passPercent != null && pcts[i] >= a.schedule.paper.passPercent).length, withPass = attempts.filter((a) => a.schedule.paper.passPercent != null).length;
  const progress = members.map((m) => { const req = m.items.filter((i) => !i.optional); return req.length ? req.filter((i) => i.status === "DONE").length / req.length : 0; });
  return {
    jobs: mods.has("DRIVES") ? { approved: n(jds, "APPROVED"), inReview: n(jds, "IN_REVIEW") + n(jds, "SUBMITTED"), draft: n(jds, "DRAFT"), shortlisted: shortlists } : null,
    campaigns: mods.has("DRIVES") ? { active: n(camps, "ACTIVE"), draft: n(camps, "DRAFT"), complete: n(camps, "COMPLETE"), students: members.length, accepted: members.filter((m) => m.status === "ACCEPTED").length, ready: members.filter((m) => m.readyMarkedAt).length, averageProgress: avg(progress.map((p) => p * 100), 0), behind: members.filter((m) => m.items.some((i) => i.status === "PENDING" && !i.optional && i.dueAt < now)).length } : null,
    tests: mods.has("ASSESSMENTS") ? { attemptsLast90Days: attempts.length, students: new Set(attempts.map((a) => a.studentId)).size, averagePercent: avg(pcts), passRate: withPass ? pct(passed, withPass) : null } : null,
    interviews: { completedLast90Days: ivs.length, assigned: ivs.filter((i) => i.assignmentId).length, averageScore: avg(ivs.flatMap((i) => scoreOf(i.feedback) ?? [])), assignments: assignedIv },
    discussions: { completedLast90Days: dss.length, assigned: dss.filter((d) => d.assignmentId).length, averageScore: avg(dss.flatMap((d) => cleanEvaluation(d.feedback, d.kind as never)?.score ?? [])), assignments: assignedDs },
  };
}

/** The spread of Career Readiness Index bands across students. Worked out from up to `cap` students (a fixed sample, so the figure is steady), and says so. Staff audience: interviews counted only if assigned. */
export async function readinessSummary(s: Session, cap = 300) {
  const where = { collegeId: s.collegeId, isActive: true, isArchived: false, ...departmentScope(s) };
  const [total, sample] = await Promise.all([db.student.count({ where }), db.student.findMany({ where, orderBy: { id: "asc" }, take: cap, select: { id: true } })]);
  const res = await careerFor(s.collegeId, sample.map((x) => x.id), "staff");
  const bands = { JUST_STARTING: 0, BUILDING: 0, PROGRESSING: 0, STRONG: 0, VERY_STRONG: 0 } as Record<string, number>;
  const parts = new Map<string, number[]>();
  for (const r of res.values()) { bands[r.band]++; for (const c of r.components) if (c.value !== null) parts.set(c.label, [...(parts.get(c.label) ?? []), c.value * 100]); }
  const scores = [...res.values()].map((r) => r.score);
  return { sampled: res.size, total, average: avg(scores, 0), bands: Object.entries(bands).map(([band, count]) => ({ band, label: BAND_LABEL[band as keyof typeof BAND_LABEL], count })), weakestParts: [...parts.entries()].map(([label, v]) => ({ label, average: Math.round(avg(v, 0) ?? 0) })).sort((a, b) => a.average - b.average).slice(0, 3) };
}

/** The principal's view: placement, departments and batches, packages by year, training and preparation activity, and company engagement. Read-only; nothing here is a student's private data (no personality results, no individual interview transcripts). */
export async function institutionDashboard(s: Session, now = new Date()) {
  const mods = await modulesOf(s.collegeId);
  const [ov, offers, drives, companies, recruiters, learning, prep] = await Promise.all([
    overview(s, { includeHistorical: true }),
    db.offer.findMany({ where: { collegeId: s.collegeId, status: { not: "REVOKED" } }, select: { companyId: true, status: true, packageLpa: true, offerYear: true, offeredAt: true }, take: 50_000 }),
    db.drive.findMany({ where: { collegeId: s.collegeId, status: { in: ["PUBLISHED", "CLOSED"] } }, select: { companyId: true, driveDate: true, status: true }, take: 20_000 }),
    db.company.findMany({ where: { collegeId: s.collegeId }, select: { id: true, name: true, tier: true, isActive: true } }),
    db.recruiter.count({ where: { company: { collegeId: s.collegeId } } }),
    mods.has("LEARNING") ? learningSummary(s.collegeId) : Promise.resolve(null),
    preparationDashboard(s, now),
  ]);
  const name = new Map(companies.map((c) => [c.id, c.name]));
  const years = new Map<number, { offers: number; accepted: number; pk: number[] }>();
  for (const o of offers) { const y = placementYear(o), r = years.get(y) ?? { offers: 0, accepted: 0, pk: [] }; r.offers++; if (o.status === "ACCEPTED") { r.accepted++; r.pk.push(Number(o.packageLpa)); } years.set(y, r); }
  const byYear = [...years.entries()].sort((a, b) => b[0] - a[0]).slice(0, 6).reverse().map(([year, r]) => ({ year, offers: r.offers, accepted: r.accepted, averageLpa: avg(r.pk), highestLpa: r.pk.length ? Math.max(...r.pk) : null }));
  const perCompany = new Map<string, number>(); for (const o of offers) if (o.status === "ACCEPTED") perCompany.set(o.companyId, (perCompany.get(o.companyId) ?? 0) + 1);
  const driveCount = new Map<string, Set<number>>(); for (const d of drives) { const set = driveCount.get(d.companyId) ?? new Set<number>(); set.add(d.driveDate.getUTCFullYear()); driveCount.set(d.companyId, set); }
  const dc = new Map<string, number>(); for (const d of drives) dc.set(d.companyId, (dc.get(d.companyId) ?? 0) + 1);
  return {
    placement: ov.placement, packages: ov.packages, offers: ov.offers, byDepartment: ov.byDepartment, byBatch: ov.byBatch, byYear,
    companies: { total: companies.length, active: companies.filter((c) => c.isActive).length, visited: ov.companies.visited, recruiters, drives: drives.length, upcoming: drives.filter((d) => d.status === "PUBLISHED" && d.driveDate > now).length, repeat: [...dc.values()].filter((n) => n >= 2).length, returningAcrossYears: [...driveCount.values()].filter((y) => y.size >= 2).length, topRecruiters: [...perCompany.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, accepted]) => ({ company: name.get(id) ?? "?", accepted })) },
    training: learning && { courses: learning.courses, learners: learning.learners, learnerPercent: learning.learnerPercent, completionPercent: learning.completionPercent, enrolments: learning.enrolments },
    preparation: prep,
    generatedAt: now,
  };
}
