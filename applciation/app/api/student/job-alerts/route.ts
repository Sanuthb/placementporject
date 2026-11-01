import { studentRoute } from "@/lib/api/studentHandler";
import { db } from "@/lib/db";
import { visibleAlertsFor } from "@/lib/jobAlerts";

export const GET = studentRoute({ module: "DRIVES" }, async (_req, me) => {
  const alerts = await visibleAlertsFor({ id: me.studentId, ...me });
  const mine = new Set((await db.jobAlertEvent.findMany({ where: { studentId: me.studentId, kind: "INTERESTED", alertId: { in: alerts.map((a) => a.id) } }, select: { alertId: true } })).map((e) => e.alertId));
  return alerts.map((a) => ({ interested: mine.has(a.id), id: a.id, title: a.title, companyName: a.companyName, jobType: a.jobType, location: a.location, description: a.description, applyUrl: a.applyUrl, deadline: a.deadline, publishedAt: a.publishedAt }));
});
