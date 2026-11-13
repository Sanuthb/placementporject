import { platformRoute } from "@/lib/api/platformHandler";
import { parseBody } from "@/lib/api/parse";
import { retentionInput } from "@/lib/platformPolicy";
import { setRetention } from "@/lib/platformPolicyAdmin";

/** Sets retention periods (days) within the allowed ranges; null restores the default. A change that would remove records needs confirm: true. Nothing is deleted by this call. */
export const PUT = platformRoute({ limit: { name: "platform-policy-write", max: 30, windowSec: 600 } }, async (req, admin) => setRetention(admin, await parseBody(req, retentionInput), req));
