import { studentRoute } from "@/lib/api/studentHandler";
import { db } from "@/lib/db";
import { personalityHistory, testHistory } from "@/lib/assessmentHistory";

/** My results over time: every attempt at every test, and my personality and aptitude results (when that module is on). */
export const GET = studentRoute({ module: "ASSESSMENTS" }, async (_req, me) => {
  const psych = await db.collegeModule.findUnique({ where: { collegeId_module: { collegeId: me.collegeId, module: "PSYCHOMETRICS" } }, select: { enabled: true } });
  return { tests: await testHistory(me.collegeId, me.studentId), personality: psych?.enabled ? await personalityHistory(me.studentId) : null };
});
