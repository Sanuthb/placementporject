import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError, notFound } from "@/lib/api/errors";
import { groqConfigured } from "@/lib/intelligence/groq";
import { retakeDecision, type Decision } from "@/lib/reassessment";
import { ruleOf } from "@/lib/reassessmentRules";
import { INSTRUMENTS, instrumentByKey } from "@/lib/instruments/index";
import { answersSchema, scoreInstrument, scoreWriting } from "@/lib/instruments/scoring";
import { markWriting } from "@/lib/instruments/writingAi";
import type { Instrument, Result } from "@/lib/instruments/types";
import type { Prisma } from "@/generated/prisma/client";

type Me = { collegeId: string; studentId: string };

export function instrumentOrThrow(key: string): Instrument {
  const i = instrumentByKey(key);
  if (!i) throw notFound("Test not found");
  return i;
}
/** Writing tests need the AI; they are hidden from students (not just broken) when it is not configured. */
export const available = (i: Instrument) => !i.items.some((x) => x.kind === "writing") || groqConfigured();

/** May this student start the test now, under their college's retake rule for the test's category? */
export async function decisionFor(me: Me, inst: Instrument): Promise<{ decision: Decision; attempts: number }> {
  const [past, rule] = await Promise.all([
    db.instrumentAttempt.findMany({ where: { studentId: me.studentId, instrumentKey: inst.key }, select: { attemptNumber: true, completedAt: true }, orderBy: { attemptNumber: "asc" } }),
    ruleOf(me.collegeId, inst.category),
  ]);
  // A saved attempt is always a finished one, so the rule is applied to completed attempts.
  const decision = retakeDecision({ rule, attempts: past.map((p) => ({ attemptNumber: p.attemptNumber, status: "SUBMITTED", submittedAt: p.completedAt })) });
  return { decision, attempts: past.length };
}

/** The tests a student can take, with where they stand on each. */
export async function listForStudent(me: Me) {
  const [st, current] = await Promise.all([
    db.student.findUniqueOrThrow({ where: { id: me.studentId }, select: { psychConsentAt: true, psychShareWithStaff: true } }),
    db.instrumentAttempt.findMany({ where: { studentId: me.studentId, isCurrent: true }, select: { instrumentKey: true, completedAt: true, attemptNumber: true } }),
  ]);
  const out = [];
  for (const inst of INSTRUMENTS.filter(available)) {
    const { decision, attempts } = await decisionFor(me, inst);
    const cur = current.find((c) => c.instrumentKey === inst.key);
    out.push({
      key: inst.key, title: inst.title, description: inst.description, category: inst.category, private: inst.private, minutes: inst.minutes, items: inst.items.length,
      attempts, lastAt: cur?.completedAt ?? null,
      canTake: decision.kind === "start", blockedReason: decision.kind === "refuse" ? decision.message : null, availableFrom: decision.kind === "refuse" ? decision.nextAt ?? null : null,
    });
  }
  return { consentAt: st.psychConsentAt, sharedWithStaff: st.psychShareWithStaff, tests: out };
}

/**
 * Scores and stores one attempt. Private (personality-style) tests need consent first. The retake rule is checked on the server, and the
 * previous attempt stays as history while the new one becomes current.
 */
export async function submitAttempt(me: Me, key: string, raw: unknown): Promise<Result> {
  const inst = instrumentOrThrow(key);
  if (!available(inst)) throw new ApiError(503, "AI_NOT_CONFIGURED", "This test is not available yet");
  const parsed = answersSchema(inst).safeParse(raw);
  if (!parsed.success) throw new ApiError(400, "BAD_REQUEST", parsed.error.issues[0]?.message ?? "Some answers are missing", parsed.error.issues.slice(0, 10));
  const answers = parsed.data;
  if (inst.private) {
    const st = await db.student.findUniqueOrThrow({ where: { id: me.studentId }, select: { psychConsentAt: true } });
    if (!st.psychConsentAt) throw new ApiError(409, "CONSENT_REQUIRED", "Give your consent before taking this test");
  }
  const { decision, attempts } = await decisionFor(me, inst);
  if (decision.kind === "refuse") throw new ApiError(409, "CONFLICT", decision.message);

  let result: Result;
  const writing = inst.items.find((i) => i.kind === "writing");
  if (writing && writing.kind === "writing") {
    const { marks, comments } = await markWriting(inst, writing.prompt, String(answers[writing.id]));
    result = scoreWriting(inst, marks, comments);
  } else result = scoreInstrument(inst, answers);

  await db.$transaction(async (tx) => {
    await tx.instrumentAttempt.updateMany({ where: { studentId: me.studentId, instrumentKey: inst.key, isCurrent: true }, data: { isCurrent: false } });
    await tx.instrumentAttempt.create({ data: { collegeId: me.collegeId, studentId: me.studentId, instrumentKey: inst.key, instrumentVersion: inst.version, attemptNumber: attempts + 1, answers: answers as Prisma.InputJsonValue, scores: result as unknown as Prisma.InputJsonValue, isCurrent: true } });
    await audit({ collegeId: me.collegeId, userId: null }, { action: "instrument.complete", entity: "Student", entityId: me.studentId, after: { test: inst.key, attempt: attempts + 1 } }, tx);
  });
  return result;
}

/** The student's own results for one test: the current one and every earlier attempt. */
export async function resultsFor(me: Me, key: string) {
  const inst = instrumentOrThrow(key);
  const rows = await db.instrumentAttempt.findMany({ where: { studentId: me.studentId, instrumentKey: key }, orderBy: { attemptNumber: "asc" }, select: { attemptNumber: true, completedAt: true, scores: true, isCurrent: true } });
  return { test: { key: inst.key, title: inst.title, caution: inst.caution, scales: inst.scales.map(({ key: k, label }) => ({ key: k, label })) }, attempts: rows.map((r) => ({ attemptNumber: r.attemptNumber, at: r.completedAt, isCurrent: r.isCurrent, result: r.scores as unknown as Result })) };
}
