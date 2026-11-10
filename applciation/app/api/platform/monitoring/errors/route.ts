import { platformRoute } from "@/lib/api/platformHandler";
import { parseQuery } from "@/lib/api/parse";
import { listErrors } from "@/lib/monitorStore";
import { errorsQuery } from "@/lib/monitorQuery";

/** Recent server errors kept in this instance's memory (bounded, newest first, paged). Messages are scrubbed of secrets and personal data before they are stored. */
export const GET = platformRoute({}, async (req) => listErrors(parseQuery(req, errorsQuery)));
