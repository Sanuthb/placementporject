import { route } from "@/lib/api/handler";
import { audit } from "@/lib/audit";
import { send } from "@/lib/reportRoutes";
import { interviewReportDoc } from "@/lib/reportService";

/** The report on an interview the placement office assigned. A student's own practice interviews are never found here. */
export const GET = route<{ interviewId: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER", "DEPARTMENT_COORDINATOR"], module: "ASSESSMENTS" }, async (req, s, { interviewId }) => {
  const doc = await interviewReportDoc({ kind: "staff", s }, interviewId);
  await audit(s, { action: "report.interview", entity: "MockInterview", entityId: interviewId });
  return send(req, doc);
});
