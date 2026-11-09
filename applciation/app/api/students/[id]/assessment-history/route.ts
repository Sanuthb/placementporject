import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { scopedStudent } from "@/lib/verification";
import { testHistory } from "@/lib/assessmentHistory";

/**
 * A student's test results over time, for staff. Personality scores are deliberately left out: they stay behind the student's sharing choice
 * and the logged access route (/api/psychometrics/students/[id]/result). Staff see only how many times it was taken and when.
 */
export const GET = route<{ id: string }>({ module: "ASSESSMENTS" }, async (_req, s, { id }) => {
  await scopedStudent(s, id);
  const psych = await db.psychAttempt.findMany({ where: { studentId: id, collegeId: s.collegeId }, select: { completedAt: true }, orderBy: { completedAt: "asc" } });
  return { tests: await testHistory(s.collegeId, id), personality: { attempts: psych.length, lastAt: psych.at(-1)?.completedAt ?? null } };
});
