import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { nirfTable, nirfXlsx } from "@/lib/reports";

const query = z.object({ year: z.coerce.number().int().min(1990).max(2100), format: z.enum(["json", "xlsx"]).default("json") });

/** NAAC/NIRF-style placement data for the batch graduating in `year`. */
export const GET = route({ limit: { name: "report-pdf", max: 60, windowSec: 3600 }, roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ANALYTICS" }, async (req, s) => {
  const q = parseQuery(req, query);
  if (q.format === "json") return nirfTable(s.collegeId, q.year);
  return new Response(new Uint8Array(await nirfXlsx(s.collegeId, q.year)), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="placement-data-${q.year}.xlsx"` } });
});
