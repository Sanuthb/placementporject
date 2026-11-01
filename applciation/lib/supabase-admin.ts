import { createClient } from "@supabase/supabase-js";

/** Service-role client. Server only: never import from client code. */
export const supabaseAdmin = () =>
  createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

/** Blocks or unblocks a Supabase login (used when a student is deactivated or reactivated). */
export async function setLoginBlocked(userId: string, blocked: boolean) {
  const { error } = await supabaseAdmin().auth.admin.updateUserById(userId, { ban_duration: blocked ? "876000h" : "none" });
  if (error) throw error;
}
