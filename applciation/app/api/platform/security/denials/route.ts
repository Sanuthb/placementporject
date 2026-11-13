import { platformRoute } from "@/lib/api/platformHandler";
import { parseQuery } from "@/lib/api/parse";
import { denialSummary, summaryQuery } from "@/lib/platformDenials";

/** Platform administrators with the second step only. Counts of refused requests (role or module), by route and institution. No person and no request content. */
export const GET = platformRoute({}, async (req) => denialSummary(parseQuery(req, summaryQuery)));
