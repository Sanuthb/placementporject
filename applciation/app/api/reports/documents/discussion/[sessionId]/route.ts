import { route } from "@/lib/api/handler";
import { audit } from "@/lib/audit";
import { send } from "@/lib/reportRoutes";
import { discussionReportDoc } from "@/lib/reportService";

/** The report on a session the placement office assigned. A student's own practice sessions are never found here. */
export const GET = route<{ sessionId: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER", "DEPARTMENT_COORDINATOR"], module: "ASSESSMENTS" }, async (req, s, { sessionId }) => {
  const doc = await discussionReportDoc({ kind: "staff", s }, sessionId);
  await audit(s, { action: "report.discussion", entity: "DiscussionSession", entityId: sessionId });
  return send(req, doc);
});
