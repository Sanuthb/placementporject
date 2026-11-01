import { studentRoute } from "@/lib/api/studentHandler";
import { db } from "@/lib/db";
import { stepsOf } from "@/lib/learning";

/** My programmes, with each step and what I have completed. */
export const GET = studentRoute({ module: "LEARNING" }, async (_req, me) => {
  const ms = await db.learningMember.findMany({ where: { studentId: me.studentId, programme: { status: "ACTIVE" } }, include: { programme: { include: { journey: true } }, progress: true } });
  return ms.map((m) => {
    const steps = stepsOf(m.programme.journey?.steps);
    const done = new Set(m.progress.map((p) => p.stepIndex));
    return {
      programmeId: m.programmeId, title: m.programme.title, goal: m.programme.goal, delivery: m.programme.delivery, partnerName: m.programme.partnerName, startsAt: m.programme.startsAt, endsAt: m.programme.endsAt,
      percent: steps.length ? Math.round((done.size / steps.length) * 100) : 0, steps: steps.map((st, i) => ({ index: i, ...st, completed: done.has(i) })),
    };
  });
});
