import { platformRoute } from "@/lib/api/platformHandler";

/** Who the platform administrator is and what two-step step they are at. Reachable before MFA is complete so the screen can show the right step. */
export const GET = platformRoute({ allowUnverified: true }, async (_req, a) => ({ email: a.email, name: a.name, mfa: a.mfa }));
