import { studentRoute } from "@/lib/api/studentHandler";
import { send } from "@/lib/reportRoutes";
import { performanceReportDoc } from "@/lib/reportService";

/** My performance report across tests and interviews. Personality results are not included. */
export const GET = studentRoute({ module: "ASSESSMENTS" }, async (req, me) => send(req, await performanceReportDoc({ kind: "student", me })));
