import { platformRoute } from "@/lib/api/platformHandler";
import { parseQuery } from "@/lib/api/parse";
import { eventsQuery, securityEvents } from "@/lib/platformSecurity";

/** Platform administrators with the second step only. The recorded audit events with each one's review. Masked exactly as the audit log is. */
export const GET = platformRoute({}, async (req) => securityEvents(parseQuery(req, eventsQuery)));
