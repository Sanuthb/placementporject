import { platformRoute } from "@/lib/api/platformHandler";
import { parseBody } from "@/lib/api/parse";
import { editInput, editInstitution, institutionDetail, parseId } from "@/lib/institutionAdmin";

/** Institution detail: settings, modules, first administrator, counts, last activity and the platform's change history. No college records. */
export const GET = platformRoute<{ id: string }>({}, async (_req, _a, { id }) => institutionDetail(parseId(id)));

/**
 * Edit name, colour, logo, modules and status in one audited transaction. Switching an institution off blocks every one of its sign-ins (getSession
 * refuses inactive colleges); switching a module off hides it. Nothing is deleted. `expectedUpdatedAt` guards against overwriting a newer change.
 */
export const PATCH = platformRoute<{ id: string }>({ limit: { name: "institution-edit", max: 120, windowSec: 600 } }, async (req, admin, { id }) =>
  editInstitution(admin, parseId(id), await parseBody(req, editInput)));
