import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ApiError, forbidden, unauthorized } from "@/lib/api/errors";
import { verifyTokenInfo } from "@/lib/auth/verifyToken";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type PlatformMfa = "setup_required" | "challenge" | "ok";
export type PlatformSession = { adminId: string; email: string; name: string; token: string; mfa: PlatformMfa };

/**
 * The state of this administrator's two-step sign-in, read fresh from Supabase every time (no cache, so a removed factor takes effect at once).
 * Fails closed: if Supabase cannot be asked, the request is refused rather than treated as "no MFA needed".
 */
export async function platformMfaState(userId: string, aal: string): Promise<PlatformMfa> {
  const { data, error } = await supabaseAdmin().auth.admin.mfa.listFactors({ userId });
  if (error) throw new ApiError(503, "AUTH_UNAVAILABLE", "Could not check two-step sign-in. Try again");
  if (!(data.factors ?? []).some((f) => f.status === "verified")) return "setup_required";
  return aal === "aal2" ? "ok" : "challenge";
}

/**
 * Platform administrators run the platform itself (creating institutions). This is a separate boundary from college staff:
 * the identity must be in the PlatformAdmin table, which has no API to write to (rows are added with `npm run db:platform-admin`).
 * A TPO administrator is never a platform administrator unless someone deliberately adds their identity there, and a platform
 * administrator has no User row, so every college route refuses them.
 *
 * Two-step sign-in is mandatory and does not depend on any college setting: without an enrolled authenticator the session is refused
 * (MFA_SETUP_REQUIRED), and an enrolled administrator must have an aal2 token (MFA_REQUIRED). Only the routes that perform enrolment and the
 * challenge itself pass `allowUnverified`.
 */
export async function getPlatformSession(req: NextRequest, opts: { allowUnverified?: boolean } = {}): Promise<PlatformSession> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw unauthorized();
  const info = await verifyTokenInfo(token);
  const admin = await db.platformAdmin.findUnique({ where: { id: info.userId } });
  if (!admin || !admin.isActive) throw forbidden("Platform administrator access required");
  const mfa = await platformMfaState(admin.id, info.aal);
  if (!opts.allowUnverified) {
    if (mfa === "setup_required") throw new ApiError(403, "MFA_SETUP_REQUIRED", "Platform administrators must set up two-step sign-in before continuing");
    if (mfa === "challenge") throw new ApiError(403, "MFA_REQUIRED", "Confirm your sign-in with the code from your authenticator app");
  }
  return { adminId: admin.id, email: admin.email, name: admin.name, token, mfa };
}

/** Calls the Auth server's MFA endpoints as the signed-in administrator, so the server can see (and audit) each step. */
export async function authMfa<T>(token: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T }> {
  const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, apikey: process.env.SUPABASE_ANON_KEY!, "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return { ok: r.ok, status: r.status, data: (await r.json().catch(() => ({}))) as T };
}
