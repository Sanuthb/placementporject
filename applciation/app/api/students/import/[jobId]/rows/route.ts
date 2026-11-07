import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { loadJob } from "@/lib/import/job";
import { countResults, validateRows } from "@/lib/import/students";

const query = z.object({
  status: z.enum(["all", "ok", "skipped", "failed", "excluded"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
});
const PAGE = 50;

/** Every row with its outcome and reasons, a page at a time. */
export const GET = route<{ jobId: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (req, s, { jobId }) => {
  const q = parseQuery(req, query);
  const { data } = await loadJob(s, jobId, false);
  const results = await validateRows(s.collegeId, data.rows, new Set(data.excluded));
  const shown = results.filter((r) => q.status === "all" || r.status === q.status);
  return {
    counts: countResults(results),
    total: shown.length, page: q.page, pageSize: PAGE,
    items: shown.slice((q.page - 1) * PAGE, q.page * PAGE).map(({ row, data: d, status, reasons }) => ({ row, data: d, status, reasons })),
  };
});
