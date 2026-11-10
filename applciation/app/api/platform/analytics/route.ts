import { platformRoute } from "@/lib/api/platformHandler";
import { parseQuery } from "@/lib/api/parse";
import { analyticsQuery, platformSeries, platformSummary, recentActivity } from "@/lib/platformAnalytics";

/** Platform administrators with the second step only. Aggregates only: counts and rates, never a person's record. Read-only (GET only). */
export const GET = platformRoute({}, async (req) => {
  const f = parseQuery(req, analyticsQuery);
  const [summary, series, activity] = await Promise.all([platformSummary(f), platformSeries(f), recentActivity(f)]);
  return { ...summary, series, recent: activity };
});
