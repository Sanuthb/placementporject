import { db } from "@/lib/db";
import { badRequest } from "@/lib/api/errors";
import { visibleTo } from "@/lib/lmsService";
import { compareAttempts, nextTest, recommendMaterials, reassessDate, pickExercises } from "@/lib/mockTest";
import { scheduleOpenTo } from "@/lib/studentAssessments";
import { ruleOf } from "@/lib/reassessmentRules";
import { studentResources } from "@/lib/resourceService";

import { ApiError } from "@/lib/api/errors";
import type { StudentSession } from "@/lib/auth/student";
import { paperQuestions } from "@/lib/assessments";
import { buildReport, shapeReport, visibilityOf, type Answer, type Marks, type Report } from "@/lib/mockTest";
import { markOpenAnswers } from "@/lib/openMarking";
import { visibleSchedule } from "@/lib/studentAssessments";

type Sch = Awaited<ReturnType<typeof visibleSchedule>>;
type Att = NonNullable<Awaited<ReturnType<typeof db.assessmentAttempt.findFirst>>>;

export const reportOfAttempt = (sch: Sch, a: Att): Report =>
  buildReport({ qs: paperQuestions(sch.paper.questions), answers: (a.answers ?? {}) as Record<string, Answer>, marks: (a.marks ?? {}) as Marks, startedAt: a.startedAt, submittedAt: a.submittedAt, passPercent: sch.paper.passPercent, sectionCutoffs: (sch.paper.sectionCutoffs ?? {}) as Record<string, number> });

/** My newest finished attempt of a test, its full report, and the one before it (for comparison). Open answers still waiting get one AI marking pass first. */
export async function myReport(me: StudentSession, scheduleId: string) {
  const sch = await visibleSchedule(me, scheduleId);
  let finished = await db.assessmentAttempt.findMany({ where: { scheduleId, studentId: me.studentId, status: { not: "IN_PROGRESS" } }, orderBy: { attemptNumber: "desc" }, take: 2 });
  if (!finished.length) throw new ApiError(409, "NOT_FINISHED", "You have not finished this assessment");
  if (finished[0].reviewStatus === "PENDING") {
    await markOpenAnswers(finished[0].id).catch(() => undefined);
    finished = await db.assessmentAttempt.findMany({ where: { scheduleId, studentId: me.studentId, status: { not: "IN_PROGRESS" } }, orderBy: { attemptNumber: "desc" }, take: 2 });
  }
  const [a, prev] = finished;
  const full = reportOfAttempt(sch, a);
  const vis = visibilityOf(sch.resultVisibility, sch.isPractice);
  return { sch, attempt: a, full, prev: prev && prev.reviewStatus !== "PENDING" ? reportOfAttempt(sch, prev) : null, vis, shaped: shapeReport(full, vis, new Date(), sch.endsAt) };
}

/**
 * What to do next after a test: the topics to work on, study material and courses for them, how many targeted practice questions the college has on those topics,
 * when to take the test again, the next test to take, and how this attempt compares with the last. Needs the schedule to share the analysis, and the attempt to be fully marked.
 */
export async function improvementPlan(me: StudentSession, id: string, r: Awaited<ReturnType<typeof myReport>>) {
  if (r.vis === "SCORE_ONLY") throw badRequest("This test shares only the score, so there is no analysis to improve from");
  if (r.full.provisional) throw badRequest("Part of this test is still being marked. Come back when your final score is ready");
  const weak = r.full.weakTopics;
  const now = new Date();
  const [res, courses, plan, cands, rule, scheds] = await Promise.all([
    studentResources(me), db.course.findMany({ where: { collegeId: me.collegeId, status: "PUBLISHED" }, select: { id: true, title: true, skills: true, category: true, departmentId: true, batchId: true }, take: 300 }),
    db.testImprovement.findUnique({ where: { attemptId: r.attempt.id } }),
    weak.length ? db.question.findMany({ where: { collegeId: me.collegeId, type: { not: "DESCRIPTIVE" }, OR: [{ tags: { hasSome: weak.map((w) => w.topic) } }, { section: { in: weak.map((w) => w.topic.toLowerCase().replace(/\s+/g, "_")) } }] }, select: { id: true, tags: true, section: true, difficulty: true, type: true, text: true }, take: 400 }) : [],
    ruleOf(me.collegeId, r.sch.paper.category),
    db.assessmentSchedule.findMany({ where: { collegeId: me.collegeId, endsAt: { gt: now } }, select: { id: true, title: true, startsAt: true, endsAt: true, isPractice: true, targetStudentIds: true, targetDepartmentIds: true, targetBatchIds: true, paper: { select: { category: true, testKind: true } }, attempts: { where: { studentId: me.studentId }, select: { id: true }, take: 1 } }, take: 100 }),
  ]);
  const materials = recommendMaterials(weak, res.map((x) => ({ id: x.id, title: x.title, terms: [x.topic ?? "", x.subject ?? "", ...x.skills].filter(Boolean) })), courses.filter((c) => visibleTo(c, me)).map((c) => ({ id: c.id, title: c.title, terms: [c.category ?? "", ...c.skills].filter(Boolean) })));
  const seen = new Set(r.full.questions.map((q) => q.id));
  const exercises = pickExercises(cands.map((c) => ({ ...c })), weak, seen);
  const next = nextTest({ category: r.sch.paper.category, kind: r.sch.paper.testKind, scheduleId: id }, scheds.filter((s) => scheduleOpenTo(s, me)).map((s) => ({ id: s.id, title: s.title, category: s.paper.category, kind: s.paper.testKind, startsAt: s.startsAt, endsAt: s.endsAt, isPractice: s.isPractice, taken: s.attempts.length > 0 })), now);
  return {
    weakTopics: weak, materials: materials.filter((m) => m.resources.length + m.courses.length > 0), uncovered: materials.filter((m) => m.resources.length + m.courses.length === 0).map((m) => m.topic),
    exercises: { available: exercises.length, topics: [...new Set(exercises.flatMap((e) => e.tags.filter((t) => weak.some((w) => w.topic.toLowerCase() === t.toLowerCase()))))] },
    reassessAt: plan?.reassessAt ?? reassessDate(weak.length, now, rule.cooldownDays), practiceScheduleId: plan?.practiceScheduleId ?? null,
    nextTest: next ? { id: next.id, title: next.title, startsAt: next.startsAt, endsAt: next.endsAt, isPractice: next.isPractice } : null,
    comparison: r.prev ? compareAttempts(r.full, r.prev) : null,
  };
}
