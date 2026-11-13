import { platformRoute } from "@/lib/api/platformHandler";
import { parseUuid, removeAdmin } from "@/lib/platformAccess";

/** Removes a platform administrator (switches the account off; the record and history stay). Not yourself, and never the last active administrator. */
export const DELETE = platformRoute<{ id: string }>({ limit: { name: "platform-admin-remove", max: 10, windowSec: 3600 } }, async (req, admin, { id }) => removeAdmin(admin, parseUuid(id, "Platform administrator"), req));
