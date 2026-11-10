import { route } from "@/lib/api/handler";
import { audit } from "@/lib/audit";
import { send } from "@/lib/reportRoutes";
import { testReportDoc } from "@/lib/reportService";

/** The full report on one test attempt, answers and explanations included. */
export const GET = route<{ attemptId: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER", "DEPARTMENT_COORDINATOR"], module: "ASSESSMENTS" }, async (req, s, { attemptId }) => {
  const doc = await testReportDoc({ kind: "staff", s }, attemptId);
  await audit(s, { action: "report.test", entity: "AssessmentAttempt", entityId: attemptId });
  return send(req, doc);
});
