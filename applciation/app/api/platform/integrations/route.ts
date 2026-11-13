import { platformRoute } from "@/lib/api/platformHandler";
import { parseQuery } from "@/lib/api/parse";
import { z } from "zod";
import { integrationStatus } from "@/lib/platformIntegrations";

const q = z.object({ refresh: z.enum(["1", "true", "0", "false"]).optional() });
/** Read-only integration status from the existing health checks (shared for 15 s; a forced refresh is limited to once per 5 s). No credentials are read or shown. */
export const GET = platformRoute({}, async (req) => integrationStatus(["1", "true"].includes(parseQuery(req, q).refresh ?? "")));
