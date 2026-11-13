import { platformRoute } from "@/lib/api/platformHandler";
import { parseBody } from "@/lib/api/parse";
import { reviewInput, setReview } from "@/lib/platformSecurity";

/** Records what was done about a recorded event. It never changes the event itself. */
export const POST = platformRoute({ limit: { name: "platform-security-review", max: 120, windowSec: 3600 } }, async (req, admin) => setReview(admin, await parseBody(req, reviewInput)));
