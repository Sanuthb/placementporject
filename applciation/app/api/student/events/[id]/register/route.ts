import { studentRoute } from "@/lib/api/studentHandler";
import { ApiError, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { eventVisibleTo, lockEvent } from "@/lib/events";

/** Registers me, or puts me on the waiting list when the event is full. */
export const POST = studentRoute<{ id: string }>({ module: "EVENTS" }, async (_req, me, { id }) => {
  const e = await db.event.findFirst({ where: { id, collegeId: me.collegeId, status: "PUBLISHED" } });
  if (!e || !eventVisibleTo(e, me)) throw notFound("Event not found");
  if (e.registrationDeadline ? e.registrationDeadline <= new Date() : e.startsAt <= new Date()) throw new ApiError(409, "REGISTRATION_CLOSED", "Registration for this event has closed");
  return db.$transaction(async (tx) => {
    await lockEvent(tx, id); // serialises registrations so capacity can never be exceeded
    const existing = await tx.eventRegistration.findUnique({ where: { eventId_studentId: { eventId: id, studentId: me.studentId } } });
    if (existing && existing.status !== "CANCELLED") throw new ApiError(409, "CONFLICT", `You are already ${existing.status.toLowerCase()}`);
    const taken = await tx.eventRegistration.count({ where: { eventId: id, status: { in: ["REGISTERED", "ATTENDED"] } } });
    const status = e.capacity !== null && taken >= e.capacity ? "WAITLISTED" : "REGISTERED";
    if (existing) await tx.eventRegistration.update({ where: { id: existing.id }, data: { status, registeredAt: new Date() } });
    else await tx.eventRegistration.create({ data: { eventId: id, studentId: me.studentId, status } });
    return { status };
  });
});
