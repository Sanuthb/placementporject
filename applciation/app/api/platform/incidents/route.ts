import { platformRoute } from "@/lib/api/platformHandler";
import { parseBody, parseQuery } from "@/lib/api/parse";
import { createIncident, createInput, incidentQuery, listIncidents } from "@/lib/platformIncidents";

/** Platform administrators with the second step only. Incidents are about the platform itself and hold no institution, student or staff data. */
export const GET = platformRoute({}, async (req) => listIncidents(parseQuery(req, incidentQuery)));
export const POST = platformRoute({ limit: { name: "platform-incident", max: 60, windowSec: 3600 } }, async (req, admin) => createIncident(admin, await parseBody(req, createInput)));
