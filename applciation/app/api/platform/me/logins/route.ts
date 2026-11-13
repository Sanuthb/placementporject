import { platformRoute } from "@/lib/api/platformHandler";
import { loginHistory, sessionIdOf } from "@/lib/platformAccount";

/** The signed-in administrator's own recent sign-ins. Never another person's. */
export const GET = platformRoute({}, async (_req, admin) => loginHistory(admin.adminId, sessionIdOf(admin.token)));
