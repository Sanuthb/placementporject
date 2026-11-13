import { platformRoute } from "@/lib/api/platformHandler";
import { listAdmins } from "@/lib/platformAccess";

export const GET = platformRoute({}, async () => ({ items: await listAdmins() }));
// DEC-01: platform administrator accounts are created by script only (scripts/create-platform-admin.ts). There is deliberately NO POST here: no registration, no invitation, no re-enabling through the API.
// Deactivating an existing administrator is DELETE /api/platform/admins/:id.
