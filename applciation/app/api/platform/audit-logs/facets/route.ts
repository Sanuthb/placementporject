import { platformRoute } from "@/lib/api/platformHandler";
import { auditFacets } from "@/lib/platformAuditView";

export const GET = platformRoute({}, async () => auditFacets());
