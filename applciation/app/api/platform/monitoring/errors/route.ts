import { platformRoute } from "@/lib/api/platformHandler";
import { parseQuery } from "@/lib/api/parse";
import { listErrors } from "@/lib/monitorStore";
import { listDurableErrors } from "@/lib/monitorEvents";
import { withTimeout } from "@/lib/health";
import { errorsQuery } from "@/lib/monitorQuery";

/**
 * Server errors, newest first, paged. Read from the durable MonitorEvent table (all instances, kept 14 days). If that table cannot be read, this instance's bounded
 * in-memory list is returned instead, marked `durable: false`, so the page can say it is a partial view. Messages were scrubbed of secrets and personal data before storage.
 */
export const GET = platformRoute({}, async (req) => {
  const q = parseQuery(req, errorsQuery);
  try { return await withTimeout(listDurableErrors(q), 3000); }
  catch { return { ...listErrors(q), durable: false as const, retentionDays: null }; }
});
