import { platformRoute } from "@/lib/api/platformHandler";
import { listModuleSettings } from "@/lib/platformModules";

/** Platform administrators with the second step only. The platform-wide switch for each module. Read-only here; changes go to /api/platform/modules/[module]. */
export const GET = platformRoute({}, async () => ({ items: await listModuleSettings() }));
