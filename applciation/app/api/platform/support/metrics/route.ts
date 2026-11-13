import { platformRoute } from "@/lib/api/platformHandler";
import { supportMetrics } from "@/lib/platformSupport";

/** Platform administrators with the second step only. Read-only counts and resolution times across all institutions; no request text and no person. */
export const GET = platformRoute({}, async () => supportMetrics());
