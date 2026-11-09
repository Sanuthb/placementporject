import { platformRoute } from "@/lib/api/platformHandler";
import { ApiError } from "@/lib/api/errors";
import { authMfa } from "@/lib/auth/platform";
import { platformAudit } from "@/lib/platformAudit";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Starts enrolment of an authenticator app. Allowed only while the administrator has none: an administrator who is already enrolled
 * cannot add a second authenticator from a session that has not passed the code (that would be a bypass).
 */
export const POST = platformRoute({ allowUnverified: true, limit: { name: "platform-mfa-enroll", max: 10, windowSec: 3600 } }, async (req, a) => {
  if (a.mfa !== "setup_required") throw new ApiError(409, "ALREADY_ENROLLED", "Two-step sign-in is already set up");
  const sb = supabaseAdmin();
  const { data } = await sb.auth.admin.mfa.listFactors({ userId: a.adminId });
  for (const f of data?.factors ?? []) await sb.auth.admin.mfa.deleteFactor({ id: f.id, userId: a.adminId }); // clear half-finished attempts
  const r = await authMfa<{ id: string; totp: { qr_code: string; secret: string } }>(a.token, "/factors", { factor_type: "totp", friendly_name: `Platform ${new Date().toISOString().slice(0, 10)}` });
  if (!r.ok) throw new ApiError(502, "AUTH_FAILED", "Could not start setup");
  await platformAudit({ adminId: a.adminId, email: a.email, action: "platform.mfa.enroll_started", req });
  return { factorId: r.data.id, qr: r.data.totp.qr_code, secret: r.data.totp.secret };
});
