import { platformRoute } from "@/lib/api/platformHandler";
import { parseBody } from "@/lib/api/parse";
import { mfaInput } from "@/lib/platformPolicy";
import { setMfaPolicy } from "@/lib/platformPolicyAdmin";

/** Turns the platform minimum on or off. When on, every institution administrator must set up two-step sign-in whatever their institution chooses; an institution can be stricter, never weaker. */
export const PUT = platformRoute({ limit: { name: "platform-policy-write", max: 30, windowSec: 600 } }, async (req, admin) => setMfaPolicy(admin, (await parseBody(req, mfaInput)).required, req));
