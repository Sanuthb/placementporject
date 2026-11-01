import { recruiterRoute } from "@/lib/api/recruiterHandler";
import { db } from "@/lib/db";

export const GET = recruiterRoute((_req, r) =>
  db.drive.findMany({ where: { collegeId: r.collegeId, companyId: r.companyId, status: { in: ["PUBLISHED", "CLOSED"] } }, select: { id: true, role: true, jobType: true, status: true, driveDate: true, venue: true, rounds: { select: { id: true, order: true, type: true, scheduledAt: true, venue: true }, orderBy: { order: "asc" } }, _count: { select: { applications: true } } }, orderBy: { driveDate: "desc" }, take: 100 }),
);
