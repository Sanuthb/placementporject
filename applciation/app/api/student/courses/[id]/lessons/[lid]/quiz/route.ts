import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { attemptsLeft, questionsOf, scoreQuiz } from "@/lib/lms";
import { markLessonDone } from "@/lib/lmsService";
import { myEnrolledCourse } from "@/lib/lmsStudent";

/**
 * Submit a quiz attempt: one chosen option (or null) per question. Passing finishes the lesson. The answer key is shown only once I have
 * passed or have no attempts left, so a failed attempt cannot be used to copy the answers into the next one.
 */
export const POST = studentRoute<{ id: string; lid: string }>({ module: "LEARNING", limit: { name: "course-quiz", max: 120, windowSec: 3600 } }, async (req, me, { id, lid }) => {
  const { enrolment } = await myEnrolledCourse(me, id);
  const l = await db.courseLesson.findFirst({ where: { id: lid, courseId: id, type: "QUIZ" } });
  if (!l) throw notFound("Quiz not found");
  const qs = questionsOf(l.questions);
  const { answers } = await parseBody(req, z.object({ answers: z.array(z.number().int().min(0).max(5).nullable()).max(50) }));
  if (answers.length !== qs.length) throw badRequest(`Send one answer per question (${qs.length})`);
  const prior = await db.quizAttempt.findMany({ where: { lessonId: lid, enrolmentId: enrolment.id }, select: { attemptNumber: true, passed: true } });
  if (prior.some((a) => a.passed)) throw badRequest("You have already passed this quiz");
  if (attemptsLeft(l.maxAttempts, prior.length) === 0) throw badRequest("You have used all your attempts");
  const r = scoreQuiz(qs, answers, l.passPercent ?? 60);
  const n = prior.length ? Math.max(...prior.map((a) => a.attemptNumber)) + 1 : 1;
  try {
    await db.quizAttempt.create({ data: { lessonId: lid, enrolmentId: enrolment.id, studentId: me.studentId, attemptNumber: n, answers, score: r.score, total: r.total, percent: r.percent, passed: r.passed } });
  } catch (e) { if ((e as { code?: string }).code === "P2002") throw badRequest("That attempt was already submitted"); throw e; }
  const left = attemptsLeft(l.maxAttempts, prior.length + 1);
  const reveal = r.passed || left === 0;
  const completion = r.passed ? await markLessonDone(enrolment.id, lid) : null;
  if (!r.passed) await db.courseEnrolment.update({ where: { id: enrolment.id }, data: { lastActivityAt: new Date() } });
  return {
    attemptNumber: n, score: r.score, total: r.total, percent: r.percent, passed: r.passed, passPercent: l.passPercent, attemptsLeft: left,
    review: qs.map((q, i) => ({ correct: r.perQuestion[i].correct, ...(reveal ? { correctOption: q.correct, explanation: q.explanation ?? null } : {}) })),
    courseCompleted: completion?.complete ?? false, certificateSerial: completion?.certificateSerial ?? null,
  };
});
