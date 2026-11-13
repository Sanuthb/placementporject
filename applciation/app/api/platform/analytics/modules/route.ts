import { platformRoute } from "@/lib/api/platformHandler";
import { moduleAdoption } from "@/lib/platformAnalytics";

/** Platform administrators with the second step only. Read-only: how many active institutions have each module switched on. Counts only; no institution is named. */
export const GET = platformRoute({}, async () => moduleAdoption());
