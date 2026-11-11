import { studentRoute } from "@/lib/api/studentHandler";
import { db } from "@/lib/db";
import { aiReadingConfigured, assertAiReadingEnabled, latestExtraction, runExtraction } from "@/lib/documentAi";

type P = { docId: string };

/** The latest AI reading of one of my documents, and whether my college has AI reading switched on. */
export const GET = studentRoute<P>({ module: "ONBOARDING" }, async (_req, me, { docId }) => {
  const s = await db.collegeSettings.findUnique({ where: { collegeId: me.collegeId }, select: { aiDocumentReading: true } });
  return { enabled: !!s?.aiDocumentReading && (await aiReadingConfigured()), reading: await latestExtraction(me.collegeId, me.studentId, docId) };
});

/** Ask the AI to read one of my documents. It only suggests: nothing in my profile changes until I accept a suggestion, and staff still check the document. */
export const POST = studentRoute<P>({ module: "ONBOARDING", limit: { name: "doc-ai-read", max: 20, windowSec: 3600 } }, async (_req, me, { docId }) => {
  await assertAiReadingEnabled(me.collegeId);
  return runExtraction({ collegeId: me.collegeId, studentId: me.studentId, documentId: docId, actorId: null });
});
