import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { eliminationStudents } from "@/lib/analytics";
import { sheetResponse } from "@/lib/xlsx";
import { RoundType } from "@/generated/prisma/client";

const query = z.object({ roundType: z.enum(RoundType).optional(), departmentId: z.uuid().optional(), batchId: z.uuid().optional(), driveId: z.uuid().optional(), format: z.enum(["json", "xlsx"]).default("json") });

/** The students behind any cell of the elimination charts. Pass the same filters as the chart plus the clicked value. */
export const GET = route({ module: "ANALYTICS" }, async (req, s) => {
  const { format, ...f } = parseQuery(req, query);
  const rows = await eliminationStudents(s, f);
  if (format === "json") return rows;
  return sheetResponse("eliminated-students.xlsx", ["enrollment_no", "name", "times_rejected", "round_types"], rows.map((r) => [r.enrollmentNo, r.name, r.times, r.roundTypes.join(", ")]));
});
