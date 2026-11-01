import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { scheduleResults } from "@/lib/assessmentResults";
import { sheetResponse } from "@/lib/xlsx";

const query = z.object({ format: z.enum(["json", "xlsx"]).default("json") });

export const GET = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ASSESSMENTS" }, async (req, s, { id }) => {
  const r = await scheduleResults(s.collegeId, id);
  if (parseQuery(req, query).format === "json") return r;
  return sheetResponse(`assessment-${id.slice(0, 8)}.xlsx`, ["enrollment_no", "name", "score", "max", "percent", "status", "violations", "flagged"], r.results.map((x) => [x.student.enrollmentNo, x.student.name, x.score, x.maxScore, x.percent, x.status, x.violations, x.flagged ? "yes" : "no"]));
});
