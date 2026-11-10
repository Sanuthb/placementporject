import { platformRoute } from "@/lib/api/platformHandler";
import { parseQuery } from "@/lib/api/parse";
import { auditQuery, listAudit } from "@/lib/platformAuditView";

/** Platform administrators with the second step only (platformRoute). Read-only: this file exports GET and nothing else, so every other method is refused with 405. */
export const GET = platformRoute({}, async (req) => listAudit(parseQuery(req, auditQuery)));
