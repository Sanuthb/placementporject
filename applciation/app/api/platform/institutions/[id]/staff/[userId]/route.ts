import { platformRoute } from "@/lib/api/platformHandler";
import { parseBody } from "@/lib/api/parse";
import { parseUuid, setStaffRoles, staffRolesInput } from "@/lib/platformAccess";

/** Assigns existing roles (and extra roles) to one staff member of one institution. A platform administrator cannot change their own access. Audited with before and after. */
export const PATCH = platformRoute<{ id: string; userId: string }>({ limit: { name: "platform-staff-roles", max: 120, windowSec: 600 } }, async (req, admin, { id, userId }) =>
  setStaffRoles(admin, parseUuid(id, "Institution"), parseUuid(userId, "Staff member"), await parseBody(req, staffRolesInput)));
