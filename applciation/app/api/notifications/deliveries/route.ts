import { route } from "@/lib/api/handler";
import { departmentScope } from "@/lib/auth/session";
import { db } from "@/lib/db";

/** What was sent outside the app (email, SMS, WhatsApp) or skipped, and why. Only students who turned a channel on appear here. */
export const GET = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER", "DEPARTMENT_COORDINATOR"] }, async (_req, s) => {
  const where = { collegeId: s.collegeId, student: { ...departmentScope(s) } };
  const [rows, groups] = await Promise.all([
    db.notificationDelivery.findMany({ where, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, channel: true, category: true, status: true, detail: true, title: true, createdAt: true, student: { select: { name: true, enrollmentNo: true } } } }),
    db.notificationDelivery.groupBy({ by: ["channel", "status"], where: { ...where, createdAt: { gt: new Date(Date.now() - 7 * 86_400_000) } }, _count: true }),
  ]);
  return { last7Days: groups.map((g) => ({ channel: g.channel, status: g.status, count: g._count })), rows };
});
