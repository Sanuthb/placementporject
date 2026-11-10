import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { placementSummaryPdf } from "@/lib/reports";

const query = z.object({ year: z.coerce.number().int().min(1990).max(2100).optional() });

export const GET = route({ limit: { name: "report-pdf", max: 60, windowSec: 3600 }, roles: ["TPO_ADMIN", "PLACEMENT_OFFICER", "PRINCIPAL"], module: "ANALYTICS" }, async (req, s) => {
  const pdf = await placementSummaryPdf(s.collegeId, parseQuery(req, query).year);
  return new Response(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="placement-report.pdf"' } });
});
