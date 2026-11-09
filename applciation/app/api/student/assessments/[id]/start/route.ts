import { studentRoute } from "@/lib/api/studentHandler";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { orderFor, paperQuestions, proctoringOf } from "@/lib/assessments";
import { visibleSchedule } from "@/lib/studentAssessments";
import { retakeDecision } from "@/lib/reassessment";
import { ruleOf } from "@/lib/reassessmentRules";

/**
 * Starts (or resumes) my attempt. Questions come without answers; the clock runs from the start of each attempt. A finished test can be taken
 * again only when the college's rule for its category allows it (practice tests always can); earlier attempts are kept.
 */
export const POST = studentRoute<{ id: string }>({ limit: { name: "exam-start", max: 30, windowSec: 3600 }, module: "ASSESSMENTS" }, async (_req, me, { id }) => {
  const sch = await visibleSchedule(me, id);
  const now = new Date();
  const past = await db.assessmentAttempt.findMany({ where: { scheduleId: id, studentId: me.studentId }, orderBy: { attemptNumber: "asc" } });
  const d = retakeDecision({ rule: await ruleOf(me.collegeId, sch.paper.category), attempts: past, isPractice: sch.isPractice, now });
  if (d.kind === "refuse") throw new ApiError(409, d.code === "COOLDOWN" ? "COOLDOWN" : "ALREADY_SUBMITTED", d.message);
  let a = past.find((x) => x.attemptNumber === d.attemptNumber) ?? null;
  if (!a) {
    if (now < sch.startsAt) throw new ApiError(409, "NOT_OPEN", "This assessment has not opened yet");
    if (now > sch.endsAt) throw new ApiError(409, "CLOSED", "This assessment has closed");
    const deadlineAt = new Date(Math.min(now.getTime() + sch.paper.durationMin * 60_000, sch.endsAt.getTime()));
    const key = { scheduleId_studentId_attemptNumber: { scheduleId: id, studentId: me.studentId, attemptNumber: d.attemptNumber } };
    try { a = await db.assessmentAttempt.create({ data: { scheduleId: id, studentId: me.studentId, deadlineAt, attemptNumber: d.attemptNumber } }); }
    catch (e) { if ((e as { code?: string }).code !== "P2002") throw e; a = await db.assessmentAttempt.findUniqueOrThrow({ where: key }); }
  } else if (Date.now() > a.deadlineAt.getTime() + 10_000) throw new ApiError(409, "TIME_UP", "Your time ran out");
  const qs = orderFor(paperQuestions(sch.paper.questions), a.id, sch.paper.shuffle);
  return {
    attemptId: a.id, attemptNumber: a.attemptNumber, deadlineAt: a.deadlineAt, secondsLeft: Math.max(0, Math.floor((a.deadlineAt.getTime() - Date.now()) / 1000)), proctoring: proctoringOf(sch.paper.proctoring), instructions: sch.paper.instructions,
    questions: qs.map(({ id: qid, text, options, marks }) => ({ id: qid, text, options, marks })), savedAnswers: a.answers,
  };
});
