import { route } from "@/lib/api/handler";
import { scopedStudent } from "@/lib/verification";
import { generateReport } from "@/lib/intelligence/service";

/** Writes a new AI reading from the current evidence and stores it. Earlier readings are kept. */
export const POST = route<{ id: string }>({ limit: { name: "intelligence", max: 40, windowSec: 3600 }, module: "ONBOARDING" }, async (_req, s, { id }) => {
  await scopedStudent(s, id);
  const r = await generateReport(s.collegeId, id, { userId: s.userId });
  return { ...r, stale: false };
});
