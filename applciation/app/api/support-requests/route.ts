import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { createInput, createRequest, listForInstitution } from "@/lib/platformSupport";

/** An institution administrator's own requests to the platform team. Scoped to the session's college; internal notes are never selected here. */
export const GET = route({ roles: ["TPO_ADMIN"] }, async (_req, s) => ({ items: await listForInstitution(s) }));
export const POST = route({ roles: ["TPO_ADMIN"], limit: { name: "support-create", max: 20, windowSec: 3600 } }, async (req, s) => createRequest(s, await parseBody(req, createInput)));
