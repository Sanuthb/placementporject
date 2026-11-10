import { route } from "@/lib/api/handler";
import { audit } from "@/lib/audit";
import { send } from "@/lib/reportRoutes";
import { performanceReportDoc } from "@/lib/reportService";

/** One student's performance report. Coordinators get only their department's students. Interviews the student started on their own are not included. */
export const GET = route<{ studentId: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER", "DEPARTMENT_COORDINATOR"], module: "ASSESSMENTS" }, async (req, s, { studentId }) => {
  const doc = await performanceReportDoc({ kind: "staff", s }, studentId);
  await audit(s, { action: "report.student", entity: "Student", entityId: studentId });
  return send(req, doc);
});
