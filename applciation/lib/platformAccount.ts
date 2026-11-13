import { db } from "@/lib/db";
import { ApiError } from "@/lib/api/errors";
import { platformAudit } from "@/lib/platformAudit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { PlatformSession } from "@/lib/auth/platform";

/**
 * The administrator's own sign-in history and session control (Control Centre, 4.17). History comes from the same table that records every other
 * kind of sign-in; a row is written once per sign-in session. The Auth service can sign a user out of their OTHER sessions, so that is what "revoke"
 * does. It cannot list sessions or end a chosen one, so this page does not claim to.
 */
/** The session id inside an access token the server has already verified. Read only to mark "this session"; it is never trusted for access. */
export function sessionIdOf(token: string): string | null {
  try { return (JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as { session_id?: string }).session_id ?? null; } catch { return null; }
}
export async function loginHistory(adminId: string, currentSessionId: string | null = null) {
  const rows = await db.loginEvent.findMany({ where: { userId: adminId, kind: "platform" }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, sessionId: true, createdAt: true, method: true, mfa: true, ip: true, userAgent: true } });
  return { items: rows.map((r) => ({ id: r.id, current: !!currentSessionId && r.sessionId === currentSessionId, at: r.createdAt, method: r.method, twoStep: r.mfa, ip: r.ip, device: (r.userAgent ?? "").slice(0, 120) || null })) };
}

export async function revokeOtherSessions(admin: PlatformSession) {
  const { error } = await supabaseAdmin().auth.admin.signOut(admin.token, "others");
  if (error) throw new ApiError(502, "AUTH_UNAVAILABLE", "Could not sign out your other sessions. Try again");
  await platformAudit({ adminId: admin.adminId, email: admin.email, action: "platform.sessions.revoked_others" });
  return { revoked: true };
}
