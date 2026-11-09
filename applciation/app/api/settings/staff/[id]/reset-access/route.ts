import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError, badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { forgetMfa } from "@/lib/auth/mfa";
import { supabaseAdmin } from "@/lib/supabase-admin";

const body = z.object({ actions: z.array(z.enum(["password", "mfa"])).min(1).max(2) });

/**
 * Admin-started access reset for a staff member: send a password-reset email, and/or remove their authenticator app so they can set up a new
 * one (for a lost phone). Each is recorded in the audit log with who did it. A person's own access is reset from their own Security page.
 */
export const POST = route<{ id: string }>({ limit: { name: "reset-access", max: 30, windowSec: 3600 }, roles: ["TPO_ADMIN"] }, async (req, s, { id }) => {
  const { actions } = await parseBody(req, body);
  if (id === s.userId) throw badRequest("Use your own Security page to change your own access");
  const u = await db.user.findFirst({ where: { id, collegeId: s.collegeId }, select: { id: true, email: true, isActive: true } });
  if (!u) throw notFound("Staff member not found");
  const sb = supabaseAdmin();
  const done: string[] = [];

  if (actions.includes("mfa")) {
    const { data, error } = await sb.auth.admin.mfa.listFactors({ userId: id });
    if (error) throw new ApiError(502, "AUTH_FAILED", "Could not read this person's sign-in settings. Try again");
    for (const f of data.factors) {
      const r = await sb.auth.admin.mfa.deleteFactor({ id: f.id, userId: id });
      if (r.error) throw new ApiError(502, "AUTH_FAILED", "Could not remove the authenticator app. Try again");
    }
    forgetMfa(id);
    done.push("mfa");
  }
  if (actions.includes("password")) {
    const { error } = await sb.auth.resetPasswordForEmail(u.email, { redirectTo: process.env.APP_URL ? `${process.env.APP_URL}/auth/accept-invite` : undefined });
    if (error) throw new ApiError(502, "EMAIL_FAILED", `The reset email could not be sent: ${error.message}`);
    done.push("password");
  }
  await audit(s, { action: "staff.access.reset", entity: "User", entityId: id, after: { actions: done } });
  return { done };
});
