import { recruiterRoute, recruiterDrive } from "@/lib/api/recruiterHandler";
import { db } from "@/lib/db";

/** Interview slots for the drive: when, where and with which candidate. */
export const GET = recruiterRoute<{ id: string }>(async (_req, r, { id }) => {
  await recruiterDrive(r, id);
  const slots = await db.interviewSlot.findMany({
    where: { driveId: id, status: { not: "CANCELLED" } },
    select: { id: true, startsAt: true, endsAt: true, status: true, round: { select: { order: true, type: true } }, panel: { select: { name: true, room: true } }, application: { select: { student: { select: { id: true, name: true } } } } },
    orderBy: { startsAt: "asc" },
  });
  return slots.map(({ application, ...s }) => ({ ...s, candidate: application.student }));
});
