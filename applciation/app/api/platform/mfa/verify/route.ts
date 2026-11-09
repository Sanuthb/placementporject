import { z } from "zod";
import { platformRoute } from "@/lib/api/platformHandler";
import { parseBody } from "@/lib/api/parse";
import { ApiError, badRequest } from "@/lib/api/errors";
import { authMfa } from "@/lib/auth/platform";
import { platformAudit } from "@/lib/platformAudit";
import { supabaseAdmin } from "@/lib/supabase-admin";

const body = z.object({ factorId: z.uuid(), code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") });

type Verified = { access_token?: string; refresh_token?: string };

/**
 * Confirms a code, either to finish enrolment or to pass the sign-in challenge. On success returns the upgraded (aal2) session for the
 * browser to adopt. Every outcome is audited; wrong codes are limited to 10 per 10 minutes per administrator.
 */
export const POST = platformRoute({ allowUnverified: true, limit: { name: "platform-mfa-verify", max: 10, windowSec: 600 } }, async (req, a) => {
  const { factorId, code } = await parseBody(req, body);
  const { data } = await supabaseAdmin().auth.admin.mfa.listFactors({ userId: a.adminId });
  const factor = (data?.factors ?? []).find((f) => f.id === factorId);
  if (!factor) throw badRequest("That authenticator was not found");
  const enrolling = factor.status !== "verified";
  const ch = await authMfa<{ id?: string }>(a.token, `/factors/${factorId}/challenge`);
  const v = ch.ok && ch.data.id ? await authMfa<Verified>(a.token, `/factors/${factorId}/verify`, { challenge_id: ch.data.id, code }) : null;
  if (!v?.ok || !v.data.access_token) {
    await platformAudit({ adminId: a.adminId, email: a.email, action: enrolling ? "platform.mfa.enroll_failed" : "platform.mfa.challenge_failed", req });
    throw new ApiError(400, "INVALID_CODE", "That code is not right. Check the app and try the newest code");
  }
  await platformAudit({ adminId: a.adminId, email: a.email, action: enrolling ? "platform.mfa.enrolled" : "platform.mfa.challenge_ok", req });
  return { access_token: v.data.access_token, refresh_token: v.data.refresh_token };
});
