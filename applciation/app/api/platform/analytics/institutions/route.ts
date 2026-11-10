import { platformRoute } from "@/lib/api/platformHandler";
import { parseQuery } from "@/lib/api/parse";
import { institutionTable, institutionTableQuery } from "@/lib/platformAnalytics";

/** Institution-wise comparison: one aggregated row per institution, sorted and paged in the database. */
export const GET = platformRoute({}, async (req) => institutionTable(parseQuery(req, institutionTableQuery)));
