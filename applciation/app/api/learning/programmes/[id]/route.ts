import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { stepsOf } from "@/lib/learning";
import { ProgrammeStatus } from "@/generated/prisma/client";

const patch = z.object({ title: z.string().trim().min(3).max(200).optional(), goal: z.string().trim().min(3).max(200).optional(), status: z.enum(ProgrammeStatus).optional(), endsAt: z.coerce.date().nullable().optional() });
const R = { roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] as ("TPO_ADMIN" | "PLACEMENT_OFFICER")[], module: "LEARNING" as const };

/** Programme with each member's progress through the journey. */
export const GET = route<{ id: string }>(R, async (_req, s, { id }) => {
  const p = await db.learningProgramme.findFirst({
    where: { id, collegeId: s.collegeId },
    include: { journey: true, members: { include: { student: { select: { id: true, name: true, enrollmentNo: true } }, progress: { select: { stepIndex: true } } } } },
  });
  if (!p) throw notFound("Programme not found");
  const steps = stepsOf(p.journey?.steps);
  const members = p.members.map((m) => ({ student: m.student, completedSteps: m.progress.length, percent: steps.length ? Math.round((m.progress.length / steps.length) * 100) : 0 })).sort((a, b) => b.percent - a.percent);
  return {
    id: p.id, title: p.title, goal: p.goal, delivery: p.delivery, partnerName: p.partnerName, status: p.status, journey: p.journey && { id: p.journey.id, name: p.journey.name, steps },
    summary: { members: members.length, averagePercent: members.length ? Math.round(members.reduce((a, m) => a + m.percent, 0) / members.length) : 0, finished: members.filter((m) => steps.length && m.completedSteps === steps.length).length },
    members,
  };
});

export const PATCH = route<{ id: string }>(R, async (req, s, { id }) => {
  const b = await parseBody(req, patch);
  return db.$transaction(async (tx) => {
    const r = await tx.learningProgramme.updateMany({ where: { id, collegeId: s.collegeId }, data: b });
    if (r.count === 0) throw notFound("Programme not found");
    await audit(s, { action: "programme.update", entity: "LearningProgramme", entityId: id, after: b as object }, tx);
    return tx.learningProgramme.findUniqueOrThrow({ where: { id } });
  });
});
