import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { elimination } from "@/lib/analytics";
import { sheetResponse } from "@/lib/xlsx";
import { RoundType } from "@/generated/prisma/client";

const query = z.object({ roundType: z.enum(RoundType).optional(), departmentId: z.uuid().optional(), batchId: z.uuid().optional(), driveId: z.uuid().optional(), format: z.enum(["json", "xlsx"]).default("json") });

export const GET = route({ module: "ANALYTICS", principalOk: true }, async (req, s) => {
  const { format, ...f } = parseQuery(req, query);
  const e = await elimination(s, f);
  if (format === "json") return e;
  return sheetResponse("elimination-by-round.xlsx", ["round_type", "eliminated", "percentage"], e.byRoundType.map((r) => [r.roundType, r.count, r.percentage]));
});
