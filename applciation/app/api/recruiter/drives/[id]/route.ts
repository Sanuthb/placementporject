import { recruiterRoute, recruiterDrive } from "@/lib/api/recruiterHandler";
import { db } from "@/lib/db";

export const GET = recruiterRoute<{ id: string }>(async (_req, r, { id }) => {
  const d = await recruiterDrive(r, id);
  const [rounds, apps] = await Promise.all([db.driveRound.findMany({ where: { driveId: id }, orderBy: { order: "asc" }, select: { id: true, order: true, type: true, scheduledAt: true, venue: true } }), db.application.groupBy({ by: ["status"], where: { driveId: id }, _count: true })]);
  return { id: d.id, role: d.role, jobType: d.jobType, location: d.location, driveDate: d.driveDate, venue: d.venue, status: d.status, description: d.description, rounds, applications: Object.fromEntries(apps.map((a) => [a.status, a._count])) };
});
