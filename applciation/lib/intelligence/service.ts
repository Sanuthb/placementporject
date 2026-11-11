import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { evidenceHash, gatherEvidence } from "@/lib/intelligence/evidence";
import { groqAvailable } from "@/lib/intelligence/groq";
import { resolveAiForCall } from "@/lib/ai/config";
import { safeFailure } from "@/lib/monitorStore";
import { writeNarrative } from "@/lib/intelligence/narrative";

/** Writes and stores a fresh AI reading from the current evidence. `actor` is null for automatic refreshes. */
export async function generateReport(collegeId: string, studentId: string, actor: { userId: string } | null) {
  const evidence = await gatherEvidence(collegeId, studentId);
  const rz = await resolveAiForCall("TEXT"); // both kill switches are enforced here; the model recorded below is exactly the one used
  const narrative = await writeNarrative(evidence, rz);
  const hash = evidenceHash(evidence);
  const usedPersonality = evidence.personalityShared && evidence.dimensions.some((d) => ["personality", "disc", "riasec"].includes(d.key) && d.items.length > 0);
  return db.$transaction(async (tx) => {
    const r = await tx.studentIntelligenceReport.create({ data: { collegeId, studentId, inputHash: hash, dimensions: evidence.dimensions, narrative, model: rz.model, generatedById: actor?.userId ?? null }, select: { id: true, createdAt: true } });
    // The access log records people. An automatic refresh has no person, and the audit entry below still records it.
    if (usedPersonality && actor) await tx.psychAccessLog.create({ data: { collegeId, actorId: actor.userId, studentId, reason: "Student 360° intelligence report" } });
    await audit({ collegeId, userId: actor?.userId ?? null }, { action: actor ? "student.intelligence.generate" : "student.intelligence.refresh", entity: "Student", entityId: studentId, after: { reportId: r.id, model: rz.model } }, tx);
    return { id: r.id, createdAt: r.createdAt, narrative };
  });
}

/** Keeps an existing reading current after something important changes. Does nothing if AI is off or no reading was ever made. Never throws. */
export async function refreshIfTracked(collegeId: string, studentId: string) {
  try {
    if (!(await groqAvailable("TEXT"))) return; // not configured, or switched off by an administrator
    if (!(await db.studentIntelligenceReport.findFirst({ where: { studentId }, select: { id: true } }))) return;
    await generateReport(collegeId, studentId, null);
  } catch (e) { console.error(JSON.stringify({ level: "warn", msg: "automatic intelligence refresh failed", error: safeFailure(e) })); /* class and code only: a database or provider message can quote student data */ }
}
