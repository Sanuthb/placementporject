import { platformRoute } from "@/lib/api/platformHandler";
import { parseQuery } from "@/lib/api/parse";
import { institutionUsage, parseId, usageQuery } from "@/lib/institutionAdmin";

/** Counts and dates for one institution over a chosen period. Platform administrators with the second step only (platformRoute). Read-only. */
export const GET = platformRoute<{ id: string }>({}, async (req, _a, { id }) => institutionUsage(parseId(id), parseQuery(req, usageQuery)));
