import { platformRoute } from "@/lib/api/platformHandler";
import { parseQuery } from "@/lib/api/parse";
import { getHealth, LIMITS, CACHE_MS, FORCE_GAP_MS } from "@/lib/health";
import { summaryQuery } from "@/lib/monitorQuery";

/**
 * Detailed health for platform administrators with the second step. Read-only: checks run, nothing is written.
 * Results are shared for 15 s; `refresh=1` forces a new check but at most once every 5 s (faster requests get the current result and `throttled: true`).
 */
export const GET = platformRoute({}, async (req) => {
  const q = parseQuery(req, summaryQuery);
  const h = await getHealth({ refresh: q.refresh === "1" || q.refresh === "true" });
  return { ...h, policy: { cacheMs: CACHE_MS, minForcedRefreshGapMs: FORCE_GAP_MS, limitsMs: { database: LIMITS.dbMs, storage: LIMITS.storageMs, ai: LIMITS.aiMs, smtp: LIMITS.smtpMs } } };
});
