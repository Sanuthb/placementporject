import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { scopedStudent } from "@/lib/verification";
import { evidenceHash, gatherEvidence } from "@/lib/intelligence/evidence";
import { groqAvailable } from "@/lib/intelligence/groq";

/**
 * The student's 360° intelligence matrix. Scores and gaps are computed fresh on every call, so they are always current.
 * The AI reading is the latest stored one, flagged `stale` when the evidence has changed since it was written.
 */
export const GET = route<{ id: string }>({ module: "ONBOARDING" }, async (_req, s, { id }) => {
  await scopedStudent(s, id);
  const [evidence, latest, history] = await Promise.all([
    gatherEvidence(s.collegeId, id),
    db.studentIntelligenceReport.findFirst({ where: { studentId: id }, orderBy: { createdAt: "desc" }, select: { id: true, inputHash: true, narrative: true, model: true, createdAt: true, dimensions: true } }),
    db.studentIntelligenceReport.findMany({ where: { studentId: id }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, createdAt: true, dimensions: true } }),
  ]);
  const hash = evidenceHash(evidence);
  // The consent-gated personality data was read for this view, so it is logged like any other staff access.
  if (evidence.personalityShared && evidence.dimensions.some((d) => ["personality", "disc", "riasec"].includes(d.key) && d.items.length > 0)) {
    await db.psychAccessLog.create({ data: { collegeId: s.collegeId, actorId: s.userId, studentId: id, reason: "Student 360° intelligence view" } });
  }
  return {
    aiConfigured: await groqAvailable("TEXT"),
    evidence,
    report: latest ? { id: latest.id, narrative: latest.narrative, model: latest.model, createdAt: latest.createdAt, stale: latest.inputHash !== hash } : null,
    // Earlier readings: the dimension scores they were based on, so progress can be compared over time.
    history: history.map((h) => ({ id: h.id, createdAt: h.createdAt, scores: Object.fromEntries((h.dimensions as { key: string; score: number | null }[]).filter((d) => d.score !== null).map((d) => [d.key, d.score])) })),
  };
});
