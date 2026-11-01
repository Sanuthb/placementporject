import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabase-admin";

/** Marks invited students as ACTIVATED once they have accepted their invite in Supabase. */
export const POST = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (_req, s) => {
  const pending = await db.student.findMany({ where: { collegeId: s.collegeId, inviteStatus: "SENT", userId: { not: null } }, select: { id: true, userId: true }, take: 500 });
  const sb = supabaseAdmin();
  const activated: string[] = [];
  for (let i = 0; i < pending.length; i += 10) {
    await Promise.all(pending.slice(i, i + 10).map(async (st) => {
      const { data } = await sb.auth.admin.getUserById(st.userId!);
      if (data.user?.confirmed_at) activated.push(st.id);
    }));
  }
  if (activated.length) await db.student.updateMany({ where: { id: { in: activated }, collegeId: s.collegeId }, data: { inviteStatus: "ACTIVATED" } });
  return { checked: pending.length, activated: activated.length };
});
