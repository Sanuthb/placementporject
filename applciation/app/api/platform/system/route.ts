import { platformRoute } from "@/lib/api/platformHandler";
import { systemConfig } from "@/lib/platformConfig";

/** Read-only system configuration: non-secret effective settings and where each comes from. No write method, no secrets. */
export const GET = platformRoute({}, async () => systemConfig());
