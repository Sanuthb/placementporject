import { studentRoute } from "@/lib/api/studentHandler";
import { db } from "@/lib/db";

/** When staff opened my profile or my personality result, and who. */
export const GET = studentRoute({}, async (_req, me) => {
  const [views, psych] = await Promise.all([
    db.profileView.findMany({ where: { studentId: me.studentId }, orderBy: { createdAt: "desc" }, take: 100, select: { actorId: true, createdAt: true } }),
    db.psychAccessLog.findMany({ where: { studentId: me.studentId }, orderBy: { createdAt: "desc" }, take: 100, select: { actorId: true, reason: true, createdAt: true } }),
  ]);
  const users = await db.user.findMany({ where: { id: { in: [...new Set([...views, ...psych].map((x) => x.actorId))] }, collegeId: me.collegeId }, select: { id: true, name: true, role: true } });
  const who = (id: string) => users.find((u) => u.id === id);
  return {
    profileViews: views.map((v) => ({ at: v.createdAt, by: who(v.actorId)?.name ?? "Placement staff", role: who(v.actorId)?.role ?? null })),
    personalityViews: psych.map((v) => ({ at: v.createdAt, by: who(v.actorId)?.name ?? "Placement staff", reason: v.reason })),
  };
});
