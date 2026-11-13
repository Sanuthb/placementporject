import { platformRoute } from "@/lib/api/platformHandler";
import { runCleanup } from "@/lib/platformPolicyAdmin";

/** Runs the bounded retention cleanup now (the same code as the hourly job). Audited with the administrator who ran it. */
export const POST = platformRoute({ limit: { name: "platform-retention-run", max: 10, windowSec: 600 } }, async (req, admin) => runCleanup(admin, req));
