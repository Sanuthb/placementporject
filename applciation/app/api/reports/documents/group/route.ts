import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { audit } from "@/lib/audit";
import { formatQuery, send } from "@/lib/reportRoutes";
import { cohortReportDoc } from "@/lib/reportService";

const q = formatQuery.extend({ batchId: z.uuid().optional(), departmentId: z.uuid().optional() });

/** A batch and/or department report: results, interview scores and the topics the group finds hardest. */
export const GET = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER", "DEPARTMENT_COORDINATOR", "PRINCIPAL"], module: "ASSESSMENTS" }, async (req, s) => {
  const p = parseQuery(req, q);
  const doc = await cohortReportDoc(s, p);
  await audit(s, { action: "report.group", entity: "Student", after: { batchId: p.batchId, departmentId: p.departmentId } });
  return send(req, doc);
});
