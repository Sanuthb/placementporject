import { platformRoute } from "@/lib/api/platformHandler";
import { policyView } from "@/lib/platformPolicyAdmin";

/** The platform policy: the minimum two-step sign-in rule for institution administrators and the retention periods for operational records. */
export const GET = platformRoute({}, async () => policyView());
