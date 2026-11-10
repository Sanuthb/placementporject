import { db } from "@/lib/db";
import { badRequest, notFound } from "@/lib/api/errors";
import type { JobDescription } from "@/generated/prisma/client";
import type { StudentSession } from "@/lib/auth/student";
import { jdData, type JdData } from "@/lib/jd";
import { matchStudent, prepSuggestions } from "@/lib/matching";
import { eligibilityRows } from "@/lib/matchingService";
import { buildMaster } from "@/lib/resumeEngine";
import { loadInputsMany } from "@/lib/resumeService";
import { completionFor } from "@/lib/profileCompletionLoad";
import { modulesOf } from "@/lib/student360";
import { SCORED_CATEGORIES, careerIndex, changesOf, jobReadiness, snapshotTrend, type CareerInput, type JobInput } from "@/lib/readiness";

/**
 * Loads the evidence the readiness rules need. `audience` matters for interviews: a student's readiness counts all their interviews, but staff see a score built
 * only from interviews the placement office assigned, because a student's own practice interviews are private (see the mock interview engine).
 */
export type Audience = "student" | "staff";
const CHUNK = 200;

type TestRow = { paperId: string; title: string; category: string; jdId: string | null; percents: number[] };
type Extras = { tests: Map<string, TestRow[]>; interviews: Map<string, { score: number; jdId: string | null }[]>; resources: Map<string, Set<string>>; courses: Map<string, Set<string>> };
const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); };

async function extrasFor(collegeId: string, ids: string[], audience: Audience): Promise<Extras> {
  const out: Extras = { tests: new Map(), interviews: new Map(), resources: new Map(), courses: new Map() };
  for (let at = 0; at < ids.length; at += CHUNK) {
    const part = ids.slice(at, at + CHUNK);
    const [attempts, ivs, rp, ce, ds] = await Promise.all([
      db.assessmentAttempt.findMany({ where: { studentId: { in: part }, status: { not: "IN_PROGRESS" }, reviewStatus: { not: "PENDING" }, score: { not: null }, schedule: { collegeId, isPractice: false, paper: { category: { in: [...SCORED_CATEGORIES] } } } }, orderBy: { submittedAt: "asc" }, select: { studentId: true, score: true, maxScore: true, schedule: { select: { paper: { select: { id: true, title: true, category: true, jdId: true } } } } } }),
      db.mockInterview.findMany({ where: { studentId: { in: part }, status: "COMPLETED", ...(audience === "staff" ? { assignmentId: { not: null } } : {}) }, select: { studentId: true, jdId: true, feedback: true } }),
      db.resourceProgress.findMany({ where: { studentId: { in: part }, completedAt: { not: null } }, select: { studentId: true, resourceId: true } }),
      db.courseEnrolment.findMany({ where: { studentId: { in: part }, status: "COMPLETED" }, select: { studentId: true, courseId: true } }),
      db.discussionSession.findMany({ where: { studentId: { in: part }, status: "COMPLETED", ...(audience === "staff" ? { assignmentId: { not: null } } : {}) }, select: { studentId: true, feedback: true } }),
    ]);
    const byStudent = new Map<string, Map<string, TestRow>>();
    for (const a of attempts) {
      const p = a.schedule.paper, m = byStudent.get(a.studentId) ?? byStudent.set(a.studentId, new Map()).get(a.studentId)!;
      const row = m.get(p.id) ?? m.set(p.id, { paperId: p.id, title: p.title, category: p.category, jdId: p.jdId ?? null, percents: [] }).get(p.id)!;
      row.percents.push(Number(a.maxScore) > 0 ? (Number(a.score) / Number(a.maxScore)) * 100 : 0);
    }
    for (const [sid, m] of byStudent) out.tests.set(sid, [...m.values()]);
    for (const i of ivs) { const s = (i.feedback as { score?: unknown } | null)?.score; if (typeof s === "number") push(out.interviews, i.studentId, { score: s, jdId: i.jdId }); }
    // Group discussions, debates and presentations count with mock interviews: spoken communication practice scored out of 10.
    for (const x of ds) { const s = (x.feedback as { score?: unknown } | null)?.score; if (typeof s === "number") push(out.interviews, x.studentId, { score: s, jdId: null }); }
    for (const r of rp) (out.resources.get(r.studentId) ?? out.resources.set(r.studentId, new Set()).get(r.studentId)!).add(r.resourceId);
    for (const c of ce) (out.courses.get(c.studentId) ?? out.courses.set(c.studentId, new Set()).get(c.studentId)!).add(c.courseId);
  }
  return out;
}

/** The Career Readiness Index for several students. */
export async function careerFor(collegeId: string, ids: string[], audience: Audience) {
  const [mods, inputs, extras, completion] = await Promise.all([modulesOf(collegeId), loadInputsMany(collegeId, ids), extrasFor(collegeId, ids, audience), completionFor(collegeId, ids)]);
  const out = new Map<string, ReturnType<typeof careerIndex>>();
  for (const id of ids) {
    const i = inputs.get(id); if (!i) continue;
    const m = buildMaster(i), c = completion.get(id);
    const input: CareerInput = {
      modules: { assessments: mods.has("ASSESSMENTS"), interviews: mods.has("STUDENT_PREP") }, profile: c ? { verifiedPercent: c.verifiedPercent } : null,
      academics: { cgpa: m.academics.cgpa, verified: m.academics.verified, activeBacklogs: m.academics.activeBacklogs },
      skills: { listed: m.skills.length, backed: m.skills.filter((s) => s.evidence.length > 0).length },
      tests: (extras.tests.get(id) ?? []).map((t) => ({ title: t.title, percents: t.percents })), interviews: (extras.interviews.get(id) ?? []).map((x) => ({ score: x.score })),
      projects: m.projects.length, internships: m.internships.filter((x) => x.source === "COLLEGE" || x.verified).length, courses: m.courses.length, resources: extras.resources.get(id)?.size ?? 0,
    };
    out.set(id, careerIndex(input));
  }
  return out;
}

const GENERAL = new Set(["APTITUDE", "TECHNICAL", "COMMUNICATION"]);
/** The Job-Specific Readiness Score of several students for one approved job description, with the eligibility gate kept apart. */
export async function jobFor(jd: JobDescription, data: JdData, ids: string[], audience: Audience) {
  const [mods, inputs, extras, el, courses, resources] = await Promise.all([
    modulesOf(jd.collegeId), loadInputsMany(jd.collegeId, ids), extrasFor(jd.collegeId, ids, audience), eligibilityRows(jd, data),
    db.course.findMany({ where: { collegeId: jd.collegeId, status: "PUBLISHED" }, select: { id: true, title: true, skills: true }, take: 300 }),
    db.prepResource.findMany({ where: { collegeId: jd.collegeId, status: "APPROVED", visibility: { not: "STAFF_ONLY" } }, select: { id: true, title: true, skills: true }, take: 500 }),
  ]);
  const elOf = new Map(el.map((r) => [r.studentId, r]));
  const out = new Map<string, ReturnType<typeof jobReadiness> & { match: { score: number; skills: { matched: string[]; partial: string[]; missing: string[] } } }>();
  for (const id of ids) {
    const i = inputs.get(id); if (!i) continue;
    const master = buildMaster(i), match = matchStudent(data, master), tests = extras.tests.get(id) ?? [], ivs = extras.interviews.get(id) ?? [];
    const linked = tests.filter((t) => t.jdId === jd.id), p = Object.fromEntries(match.parameters.map((x) => [x.key, x]));
    const sugg = match.gaps.length ? prepSuggestions(match.gaps, courses, resources) : [];
    const cIds = new Set(sugg.flatMap((s) => s.courses.map((c) => c.id))), rIds = new Set(sugg.flatMap((s) => s.resources.map((r) => r.id)));
    const prep = match.gaps.length === 0 ? { suggested: 0, done: 0 } : cIds.size + rIds.size === 0 ? null : { suggested: cIds.size + rIds.size, done: [...cIds].filter((c) => extras.courses.get(id)?.has(c)).length + [...rIds].filter((r) => extras.resources.get(id)?.has(r)).length };
    const e = elOf.get(id);
    const input: JobInput = {
      eligible: e?.eligible ?? false, eligibilityReasons: e?.reasons ?? [],
      mandatory: { status: match.mandatory.status, met: match.mandatory.met, total: match.mandatory.total, missing: match.requirements.filter((r) => r.level === "MANDATORY" && r.status === "MISSING").map((r) => r.text) },
      skills: { value: p.technical.value, ...match.skills },
      tests: { linked: linked.map((t) => ({ title: t.title, percent: t.percents[t.percents.length - 1] })), general: tests.filter((t) => GENERAL.has(t.category)).map((t) => ({ label: t.title, percent: t.percents[t.percents.length - 1] })) },
      interviews: { linked: ivs.filter((x) => x.jdId === jd.id).map((x) => x.score), general: ivs.map((x) => x.score) },
      projects: { value: p.projects.value ?? 0, note: p.projects.note }, internship: { value: p.internship.value ?? 0, note: p.internship.note },
      prep, improvement: changesOf(linked.length ? linked : tests), modules: { assessments: mods.has("ASSESSMENTS"), interviews: mods.has("STUDENT_PREP") },
    };
    out.set(id, { ...jobReadiness(input), match: { score: match.score, skills: match.skills } });
  }
  return out;
}

/** Job descriptions a student may see their readiness for: approved ones for a campaign they are in, or a drive they applied to. */
export async function studentJds(me: StudentSession) {
  const [members, apps] = await Promise.all([
    db.campaignMember.findMany({ where: { studentId: me.studentId, status: { not: "REMOVED" }, campaign: { collegeId: me.collegeId, status: { not: "DRAFT" } } }, select: { campaign: { select: { jdId: true } } } }),
    db.application.findMany({ where: { studentId: me.studentId }, select: { driveId: true } }),
  ]);
  const drives = [...new Set(apps.map((a) => a.driveId))];
  return db.jobDescription.findMany({ where: { collegeId: me.collegeId, status: "APPROVED", OR: [{ id: { in: [...new Set(members.map((m) => m.campaign.jdId))] } }, ...(drives.length ? [{ driveId: { in: drives } }] : [])] }, select: { id: true, title: true, companyName: true }, orderBy: { title: "asc" }, take: 50 });
}
export async function studentJd(me: StudentSession, jdId: string) {
  const ok = (await studentJds(me)).some((j) => j.id === jdId);
  const jd = ok ? await db.jobDescription.findFirst({ where: { id: jdId, collegeId: me.collegeId, status: "APPROVED" } }) : null;
  if (!jd) throw notFound("Job not found");
  return { jd, data: jdData.parse(jd.data) };
}

/** Saves today's score (one per student, measure and day) and returns the history, oldest first. */
export async function recordAndHistory(collegeId: string, studentId: string, scope: { kind: "CAREER" } | { kind: "JOB"; jdId: string }, r: { score: number; coverage: number; components: { key: string; value: number | null }[] }, save: boolean) {
  const scopeKey = scope.kind === "CAREER" ? "career" : scope.jdId, day = new Date(new Date().toISOString().slice(0, 10));
  if (save) await db.readinessSnapshot.upsert({ where: { studentId_scopeKey_day: { studentId, scopeKey, day } }, create: { collegeId, studentId, kind: scope.kind, jdId: scope.kind === "JOB" ? scope.jdId : null, scopeKey, day, score: r.score, coverage: r.coverage, components: r.components.map((c) => ({ key: c.key, value: c.value })) }, update: { score: r.score, coverage: r.coverage, components: r.components.map((c) => ({ key: c.key, value: c.value })) } });
  const rows = await db.readinessSnapshot.findMany({ where: { studentId, scopeKey }, orderBy: { day: "desc" }, take: 30, select: { day: true, score: true, coverage: true } });
  const history = rows.reverse().map((x) => ({ day: x.day.toISOString().slice(0, 10), score: x.score, coverage: x.coverage }));
  return { history, ...snapshotTrend(history) };
}
export const requireApproved = (jd: JobDescription) => { if (jd.status !== "APPROVED") throw badRequest("Readiness is worked out only for an approved job description"); };
