import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ApiError, forbidden, unauthorized } from "@/lib/api/errors";
import { verifyTokenInfo } from "@/lib/auth/verifyToken";
import { hasMfaFactor } from "@/lib/auth/mfa";

export type PlatformSession = { adminId: string; email: string; name: string };

/**
 * Platform administrators run the platform itself (creating institutions). This is a separate boundary from college staff:
 * the identity must be in the PlatformAdmin table, which has no API to write to (rows are added with `npm run db:platform-admin`).
 * A TPO administrator is never a platform administrator unless someone deliberately adds their identity there, and a platform
 * administrator has no User row, so every college route refuses them.
 */
export async function getPlatformSession(req: NextRequest): Promise<PlatformSession> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw unauthorized();
  const info = await verifyTokenInfo(token);
  const admin = await db.platformAdmin.findUnique({ where: { id: info.userId } });
  if (!admin || !admin.isActive) throw forbidden("Platform administrator access required");
  // Two-step sign-in is enforced once an authenticator app is set up, as for college administrators.
  if ((await hasMfaFactor(admin.id)) && info.aal !== "aal2") throw new ApiError(403, "MFA_REQUIRED", "Confirm your sign-in with the code from your authenticator app");
  return { adminId: admin.id, email: admin.email, name: admin.name };
}
