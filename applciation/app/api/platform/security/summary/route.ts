import { platformRoute } from "@/lib/api/platformHandler";
import { securitySummary } from "@/lib/platformSecurity";

export const GET = platformRoute({}, async () => securitySummary());
