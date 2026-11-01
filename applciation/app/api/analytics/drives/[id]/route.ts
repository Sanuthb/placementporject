import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { driveAnalytics } from "@/lib/analytics";
import { sheetResponse } from "@/lib/xlsx";

const query = z.object({ format: z.enum(["json", "xlsx"]).default("json") });

/** Funnel, attendance, absentees and round-wise pass/reject counts. `format=xlsx` exports the funnel. */
export const GET = route<{ id: string }>({ module: "ANALYTICS" }, async (req, s, { id }) => {
  const a = await driveAnalytics(s, id);
  if (parseQuery(req, query).format === "json") return a;
  return sheetResponse(`drive-funnel-${id.slice(0, 8)}.xlsx`, ["stage", "students"], a.funnel.map((f) => [f.stage, f.count]));
});
