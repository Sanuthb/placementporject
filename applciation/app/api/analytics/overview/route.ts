import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { overview } from "@/lib/analytics";
import { sheetResponse } from "@/lib/xlsx";

const query = z.object({
  year: z.coerce.number().int().min(1990).max(2100).optional(), batchId: z.uuid().optional(), departmentId: z.uuid().optional(), programId: z.uuid().optional(),
  includeHistorical: z.enum(["true", "false"]).default("true"), format: z.enum(["json", "xlsx"]).default("json"),
});

/** Placed vs total, package statistics, companies and offers. `format=xlsx` exports the by-department table. */
export const GET = route({ module: "ANALYTICS", principalOk: true }, async (req, s) => {
  const { format, includeHistorical, ...f } = parseQuery(req, query);
  const o = await overview(s, { ...f, includeHistorical: includeHistorical === "true" });
  if (format === "json") return o;
  return sheetResponse("placement-by-department.xlsx", ["department", "registered_students", "placed", "placed_percentage"], o.byDepartment.map((d) => [d.name, d.total, d.placed, d.percentage]));
});
