import { supabaseAdmin } from "@/lib/supabase-admin";

const cache = new Map<string, { enrolled: boolean; exp: number }>();
const TTL_MS = 60_000;

/** Whether this person has a confirmed authenticator app. Cached for a minute; `forget` clears it after a reset or enrolment. */
export async function hasMfaFactor(userId: string): Promise<boolean> {
  const hit = cache.get(userId);
  if (hit && hit.exp > Date.now()) return hit.enrolled;
  const { data, error } = await supabaseAdmin().auth.admin.mfa.listFactors({ userId });
  // If Supabase cannot be asked, do not lock everyone out: fall back to what was last known, else "not enrolled".
  const enrolled = error ? (hit?.enrolled ?? false) : (data?.factors ?? []).some((f) => f.status === "verified");
  cache.set(userId, { enrolled, exp: Date.now() + TTL_MS });
  return enrolled;
}
export const forgetMfa = (userId: string) => cache.delete(userId);

export type MfaStatus = "not_applicable" | "ok" | "challenge" | "setup_required" | "setup_recommended";

/** What the screens should do about two-step sign-in for this person right now. */
export async function mfaStatus(session: { userId: string; collegeId: string; roles: string[] }, aal: string): Promise<MfaStatus> {
  if (!session.roles.includes("TPO_ADMIN")) return "not_applicable";
  if (await hasMfaFactor(session.userId)) return aal === "aal2" ? "ok" : "challenge";
  const { db } = await import("@/lib/db");
  const s = await db.collegeSettings.findUnique({ where: { collegeId: session.collegeId }, select: { requireMfaForAdmins: true } });
  return s?.requireMfaForAdmins ? "setup_required" : "setup_recommended";
}
