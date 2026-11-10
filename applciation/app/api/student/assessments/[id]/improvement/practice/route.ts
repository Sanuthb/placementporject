import { studentRoute } from "@/lib/api/studentHandler";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { notifyStudent } from "@/lib/notify";
import type { PaperQuestion } from "@/lib/assessments";
import { pickExercises, reassessDate } from "@/lib/mockTest";
import { ruleOf } from "@/lib/reassessmentRules";
import { myReport } from "@/lib/testReportService";

const MIN_QUESTIONS = 4;

/**
 * Makes a practice set for me on the topics I got wrong in this attempt: questions from the college's banks that I did not just see, easiest first for the weakest topics.
 * It is a personal practice test (only I can see it, answers shown straight away, open for 14 days). It also records when to take the original test again. Asking twice returns the same set.
 */
export const POST = studentRoute<{ id: string }>({ module: "ASSESSMENTS", limit: { name: "targeted-practice", max: 20, windowSec: 86400 } }, async (_req, me, { id }) => {
  const r = await myReport(me, id);
  if (r.vis === "SCORE_ONLY") throw badRequest("This test shares only the score, so there is no analysis to practise from");
  if (r.full.provisional) throw badRequest("Part of this test is still being marked. Come back when your final score is ready");
  const old = await db.testImprovement.findUnique({ where: { attemptId: r.attempt.id } });
  if (old?.practiceScheduleId) return { scheduleId: old.practiceScheduleId, reused: true };
  const weak = r.full.weakTopics;
  if (!weak.length) throw badRequest("No weak topics to practise. Well done");
  const rows = await db.question.findMany({ where: { collegeId: me.collegeId, type: { not: "DESCRIPTIVE" }, OR: [{ tags: { hasSome: weak.map((w) => w.topic) } }, { section: { in: weak.map((w) => w.topic.toLowerCase().replace(/\s+/g, "_")) } }] }, take: 600 });
  const chosen = pickExercises(rows.map((c) => ({ id: c.id, text: c.text, tags: c.tags, section: c.section, difficulty: c.difficulty, type: c.type })), weak, new Set(r.full.questions.map((q) => q.id)));
  if (chosen.length < MIN_QUESTIONS) throw badRequest(`The college has only ${chosen.length} more questions on these topics, too few for a practice set. Use the study material for now`);
  const byId = new Map(rows.map((q) => [q.id, q]));
  const snapshot: PaperQuestion[] = chosen.map((c) => byId.get(c.id)!).map((q) => ({ id: q.id, text: q.text, options: q.options as string[], correct: q.correct, marks: q.marks, negativeMarks: 0, explanation: q.explanation, type: q.type as PaperQuestion["type"], context: q.context, section: q.section, tags: q.tags, difficulty: q.difficulty, acceptedAnswers: q.acceptedAnswers, modelAnswer: q.modelAnswer, rubric: q.rubric, language: q.language }));
  const rule = await ruleOf(me.collegeId, r.sch.paper.category);
  const now = new Date(), reassessAt = reassessDate(weak.length, now, rule.cooldownDays);
  const topics = weak.slice(0, 3).map((w) => w.topic).join(", ");
  const res = await db.$transaction(async (tx) => {
    const paper = await tx.assessmentPaper.create({ data: { collegeId: me.collegeId, title: `Targeted practice: ${topics}`.slice(0, 200), category: r.sch.paper.category, durationMin: Math.min(120, Math.max(10, snapshot.length * 2)), shuffle: true, proctoring: { requireFullscreen: false, maxViolations: 0 }, questions: snapshot, testKind: r.sch.paper.testKind, createdById: r.sch.createdById } });
    const sch = await tx.assessmentSchedule.create({ data: { collegeId: me.collegeId, paperId: paper.id, title: paper.title, startsAt: now, endsAt: new Date(now.getTime() + 14 * 86_400_000), isPractice: true, resultVisibility: "IMMEDIATE", targetStudentIds: [me.studentId], createdById: r.sch.createdById } });
    await tx.testImprovement.upsert({ where: { attemptId: r.attempt.id }, create: { collegeId: me.collegeId, studentId: me.studentId, attemptId: r.attempt.id, weakTopics: weak, recommendations: { questions: snapshot.length }, practiceScheduleId: sch.id, reassessAt }, update: { practiceScheduleId: sch.id, reassessAt } });
    await notifyStudent(me.collegeId, me.studentId, { type: "assessment.practice", title: `Your practice set is ready: ${topics}`, body: `Take ${r.sch.title} again from ${reassessAt.toISOString().slice(0, 10)}.`, link: `/student/assessments/${sch.id}` }, tx);
    return sch.id;
  });
  return { scheduleId: res, reused: false, questions: snapshot.length, reassessAt };
});
