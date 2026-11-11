import { platformRoute } from "@/lib/api/platformHandler";
import { parseQuery } from "@/lib/api/parse";
import { listJobRuns } from "@/lib/jobHistory";
import { jobsQuery } from "@/lib/monitorQuery";

/** Scheduled-job run history (one row per job per schedule slot: start, finish, outcome, duration, attempts, counts, sanitized failure note). Read-only, kept 90 days, paged. */
export const GET = platformRoute({}, async (req) => {
  const q = parseQuery(req, jobsQuery);
  return listJobRuns({ job: q.job, ok: q.outcome === undefined ? undefined : q.outcome === "succeeded", page: q.page, pageSize: q.pageSize });
});
