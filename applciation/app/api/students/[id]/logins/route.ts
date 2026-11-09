import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { scopedStudent } from "@/lib/verification";

/** Sign-in history of a student, for the placement team (limited to students they may see). */
export const GET = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (_req, s, { id }) => {
  const st = await scopedStudent(s, id);
  if (!st.userId) return { items: [] };
  const items = await db.loginEvent.findMany({ where: { userId: st.userId, collegeId: s.collegeId }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, createdAt: true, method: true, mfa: true, ip: true, userAgent: true } });
  return { items };
});
