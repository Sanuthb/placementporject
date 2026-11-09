import { route } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { scopedStudent } from "@/lib/verification";
import { supabaseAdmin } from "@/lib/supabase-admin";

/** Sends a student a password-reset email. A student who has not accepted their invitation has no password yet, so they need a new invitation instead. */
export const POST = route<{ id: string }>({ limit: { name: "reset-access", max: 60, windowSec: 3600 }, roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (_req, s, { id }) => {
  const st = await scopedStudent(s, id);
  if (!st.userId) throw new ApiError(409, "CONFLICT", "This student has not accepted their invitation yet. Resend the invitation instead");
  const { error } = await supabaseAdmin().auth.resetPasswordForEmail(st.email, { redirectTo: process.env.APP_URL ? `${process.env.APP_URL}/auth/accept-invite` : undefined });
  if (error) throw new ApiError(502, "EMAIL_FAILED", `The reset email could not be sent: ${error.message}`);
  await db.$transaction((tx) => audit(s, { action: "student.access.reset", entity: "Student", entityId: id, after: { actions: ["password"] } }, tx));
  return { done: ["password"] };
});
