import { platformRoute } from "@/lib/api/platformHandler";
import { parseQuery } from "@/lib/api/parse";
import { listForPlatform, supportQuery } from "@/lib/platformSupport";

/** Platform administrators with the second step only. Lists support requests from every institution; request text is masked (lib/platformSupport.ts). */
export const GET = platformRoute({}, async (req, admin) => listForPlatform(admin, parseQuery(req, supportQuery)));
