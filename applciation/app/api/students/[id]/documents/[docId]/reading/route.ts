import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { scopedStudent } from "@/lib/verification";
import { aiReadingConfigured, assertAiReadingEnabled, latestExtraction, runExtraction } from "@/lib/documentAi";

type P = { id: string; docId: string };

/** What the AI read from a student's document, next to what the student entered. A reviewing aid only: staff still verify by looking at the document. */
export const GET = route<P>({ module: "ONBOARDING" }, async (_req, s, { id, docId }) => {
  await scopedStudent(s, id);
  const set = await db.collegeSettings.findUnique({ where: { collegeId: s.collegeId }, select: { aiDocumentReading: true } });
  return { enabled: !!set?.aiDocumentReading && aiReadingConfigured(), reading: await latestExtraction(s.collegeId, id, docId) };
});

export const POST = route<P>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING", limit: { name: "doc-ai-read-staff", max: 200, windowSec: 3600 } }, async (_req, s, { id, docId }) => {
  await scopedStudent(s, id);
  await assertAiReadingEnabled(s.collegeId);
  return runExtraction({ collegeId: s.collegeId, studentId: id, documentId: docId, actorId: s.userId });
});
