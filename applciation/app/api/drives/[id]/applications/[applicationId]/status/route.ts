import { route } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { isCoordinatorOnly } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getDrive } from "@/lib/drives";
import { statusesFor } from "@/lib/placementStatusService";

/** One application's placement status: every step with when it was reached and by whom, and the history in time order. */
export const GET = route<{ id: string; applicationId: string }>({ module: "DRIVES" }, async (_req, s, { id, applicationId }) => {
  await getDrive(s.collegeId, id);
  const a = await db.application.findFirst({ where: { id: applicationId, driveId: id, collegeId: s.collegeId, ...(isCoordinatorOnly(s) ? { student: { departmentId: s.departmentId ?? "none" } } : {}) }, select: { student: { select: { name: true, enrollmentNo: true } } } });
  if (!a) throw notFound("Application not found");
  const [r] = await statusesFor({ collegeId: s.collegeId, driveId: id, applicationIds: [applicationId] }, "staff");
  return { student: a.student, status: r.status };
});
