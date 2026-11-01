import { studentRoute } from "@/lib/api/studentHandler";
import { ApiError, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { lockEvent } from "@/lib/events";

/** Cancels my registration. If a seat frees up, the longest-waiting person is moved in and told. */
export const POST = studentRoute<{ id: string }>({ module: "EVENTS" }, async (_req, me, { id }) => {
  const e = await db.event.findFirst({ where: { id, collegeId: me.collegeId } });
  if (!e) throw notFound("Event not found");
  if (e.startsAt <= new Date()) throw new ApiError(409, "CONFLICT", "The event has already started");
  return db.$transaction(async (tx) => {
    await lockEvent(tx, id);
    const mine = await tx.eventRegistration.findUnique({ where: { eventId_studentId: { eventId: id, studentId: me.studentId } } });
    if (!mine || mine.status === "CANCELLED" || mine.status === "ATTENDED") throw new ApiError(404, "NOT_FOUND", "You have no registration to cancel");
    await tx.eventRegistration.update({ where: { id: mine.id }, data: { status: "CANCELLED" } });
    let promoted: string | null = null;
    if (mine.status === "REGISTERED") {
      const next = await tx.eventRegistration.findFirst({ where: { eventId: id, status: "WAITLISTED" }, orderBy: { registeredAt: "asc" } });
      if (next) {
        await tx.eventRegistration.update({ where: { id: next.id }, data: { status: "REGISTERED" } });
        await tx.notification.create({ data: { collegeId: me.collegeId, studentId: next.studentId, type: "event.promoted", title: `A seat opened up: you are registered for ${e.title}` } });
        promoted = next.studentId;
      }
    }
    return { status: "CANCELLED", promotedFromWaitlist: !!promoted };
  });
});
