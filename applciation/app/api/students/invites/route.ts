import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { supabaseAdmin } from "@/lib/supabase-admin";

const MAX = 200;
const body = z
  .object({
    mode: z.enum(["send", "resend"]).default("send"),
    studentIds: z.array(z.uuid()).max(MAX).optional(),
    batchId: z.uuid().optional(),
    departmentId: z.uuid().optional(),
  })
  .refine((v) => v.studentIds?.length || v.batchId || v.departmentId, { message: "Select students, a batch or a department" });

export const POST = route({ limit: { name: "invite", max: 20, windowSec: 3600 }, roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (req, s) => {
  const b = await parseBody(req, body);
  const target = b.mode === "send" ? "NOT_SENT" : "SENT";
  const where = {
    collegeId: s.collegeId, isActive: true, isArchived: false, inviteStatus: target as "NOT_SENT" | "SENT",
    ...(b.studentIds?.length ? { id: { in: b.studentIds } } : { batchId: b.batchId, departmentId: b.departmentId }),
  };
  const students = await db.student.findMany({ where, select: { id: true, email: true, userId: true }, take: MAX + 1, orderBy: { id: "asc" } });
  if (!students.length) throw badRequest(b.mode === "send" ? "No students are waiting for an invite" : "No invited students are waiting to activate");
  const batch = students.slice(0, MAX);
  const remaining = students.length > MAX;

  const sent: string[] = [];
  const failed: { studentId: string; email: string; reason: string }[] = [];
  const sb = supabaseAdmin();

  for (let i = 0; i < batch.length; i += 5) {
    await Promise.all(batch.slice(i, i + 5).map(async (st) => {
      const { data, error } = await sb.auth.admin.inviteUserByEmail(st.email, {
        redirectTo: process.env.APP_URL ? `${process.env.APP_URL}/auth/accept-invite` : undefined,
      });
      if (error || !data.user) return void failed.push({ studentId: st.id, email: st.email, reason: error?.message ?? "Invite failed" });
      try {
        await db.student.update({ where: { id: st.id }, data: { userId: data.user.id, inviteStatus: "SENT", invitedAt: new Date() } });
        sent.push(st.id);
      } catch {
        failed.push({ studentId: st.id, email: st.email, reason: "Invite sent but could not be recorded" });
      }
    }));
  }

  await audit(s, { action: b.mode === "send" ? "student.invite" : "student.invite.resend", entity: "Student", after: { sent: sent.length, failed: failed.length } });
  return { sent: sent.length, failed, moreRemaining: remaining };
});
