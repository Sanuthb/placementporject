import { route } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { alertAudience } from "@/lib/jobAlerts";

/** Views and clicks, total and by unique student, against the size of the target audience. */
export const GET = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (_req, s, { id }) => {
  const alert = await db.jobAlert.findFirst({ where: { id, collegeId: s.collegeId } });
  if (!alert) throw notFound("Job alert not found");
  const events = await db.jobAlertEvent.findMany({ where: { alertId: id }, select: { studentId: true, kind: true } });
  const of = (k: "VIEW" | "CLICK" | "INTERESTED") => events.filter((e) => e.kind === k);
  return {
    audience: (await alertAudience(alert)).length,
    views: of("VIEW").length, uniqueViewers: new Set(of("VIEW").map((e) => e.studentId)).size,
    clicks: of("CLICK").length, uniqueClickers: new Set(of("CLICK").map((e) => e.studentId)).size,
    interested: new Set(of("INTERESTED").map((e) => e.studentId)).size,
  };
});
