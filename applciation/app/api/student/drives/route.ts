import { studentRoute } from "@/lib/api/studentHandler";
import { db } from "@/lib/db";
import { eligibilityFor } from "@/lib/studentDrives";

/** Open drives with whether I can apply and, if not, why. */
export const GET = studentRoute({ module: "DRIVES" }, async (req, me) => {
  const past = req.nextUrl.searchParams.get("scope") === "past";
  const now = new Date();
  const drives = await db.drive.findMany({
    where: { collegeId: me.collegeId, ...(past ? { status: { in: ["PUBLISHED", "CLOSED"] }, applicationDeadline: { lte: now } } : { status: "PUBLISHED", applicationDeadline: { gt: now } }) },
    include: { savedBy: { where: { studentId: me.studentId }, select: { studentId: true } }, company: { select: { id: true, name: true, tier: true } }, rounds: { select: { order: true, type: true }, orderBy: { order: "asc" } }, applications: { where: { studentId: me.studentId }, select: { status: true } } },
    orderBy: { applicationDeadline: past ? "desc" : "asc" }, take: 100,
  });
  return Promise.all(drives.map(async ({ applications, savedBy, ...d }) => ({
    id: d.id, role: d.role, jobType: d.jobType, location: d.location, packageMinLpa: d.packageMinLpa, packageMaxLpa: d.packageMaxLpa, venue: d.venue, driveDate: d.driveDate,
    applicationDeadline: d.applicationDeadline, company: d.company, rounds: d.rounds,
    saved: savedBy.length > 0, myApplication: applications[0]?.status ?? null,
    eligibility: past ? { eligible: false, blocked: false, reasons: [] as string[] } : await eligibilityFor(d, me.studentId),
  })));
});
