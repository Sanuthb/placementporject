import { z } from "zod";
import { platformRoute } from "@/lib/api/platformHandler";
import { parseBody } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { authMfa } from "@/lib/auth/platform";
import { platformAudit } from "@/lib/platformAudit";
import { supabaseAdmin } from "@/lib/supabase-admin";

const body = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") });

/**
 * Removes the administrator's own authenticator. Needs a session that has already passed the challenge AND a fresh code now.
 * Afterwards the administrator has no platform access until a new authenticator is set up (the server refuses them meanwhile).
 */
export const DELETE = platformRoute({ limit: { name: "platform-mfa-remove", max: 5, windowSec: 3600 } }, async (req, a) => {
  const { code } = await parseBody(req, body);
  const sb = supabaseAdmin();
  const { data } = await sb.auth.admin.mfa.listFactors({ userId: a.adminId });
  const factors = (data?.factors ?? []).filter((f) => f.status === "verified");
  const f = factors[0];
  const ch = f ? await authMfa<{ id?: string }>(a.token, `/factors/${f.id}/challenge`) : null;
  const ok = f && ch?.ok && ch.data.id && (await authMfa(a.token, `/factors/${f.id}/verify`, { challenge_id: ch.data.id, code })).ok;
  if (!ok) {
    await platformAudit({ adminId: a.adminId, email: a.email, action: "platform.mfa.remove_failed", req });
    throw new ApiError(400, "INVALID_CODE", "That code is not right");
  }
  for (const x of data?.factors ?? []) await sb.auth.admin.mfa.deleteFactor({ id: x.id, userId: a.adminId });
  await platformAudit({ adminId: a.adminId, email: a.email, action: "platform.mfa.removed", req });
  return { removed: true };
});
