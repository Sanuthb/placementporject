import { studentRoute } from "@/lib/api/studentHandler";
import { ApiError, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { stepsOf } from "@/lib/learning";

/** Mark a step of my journey as done. Safe to repeat. */
export const POST = studentRoute<{ programmeId: string; index: string }>({ module: "LEARNING" }, async (_req, me, p) => {
  const idx = Number(p.index);
  const m = await db.learningMember.findFirst({ where: { programmeId: p.programmeId, studentId: me.studentId, programme: { status: "ACTIVE" } }, include: { programme: { include: { journey: true } } } });
  if (!m) throw notFound("Programme not found");
  const steps = stepsOf(m.programme.journey?.steps);
  if (!Number.isInteger(idx) || idx < 0 || idx >= steps.length) throw new ApiError(400, "BAD_REQUEST", "That step does not exist");
  await db.learningProgress.upsert({ where: { memberId_stepIndex: { memberId: m.id, stepIndex: idx } }, update: {}, create: { memberId: m.id, stepIndex: idx } });
  const done = await db.learningProgress.count({ where: { memberId: m.id } });
  return { completedSteps: done, total: steps.length, percent: Math.round((done / steps.length) * 100) };
});
