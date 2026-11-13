import { platformRoute } from "@/lib/api/platformHandler";
import { revokeOtherSessions } from "@/lib/platformAccount";

/** Signs the administrator out everywhere except this session. */
export const POST = platformRoute({ limit: { name: "platform-session-revoke", max: 10, windowSec: 3600 } }, async (_req, admin) => revokeOtherSessions(admin));
