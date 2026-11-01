import { studentRoute } from "@/lib/api/studentHandler";
import { ApiError, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";

/** Cancel my booking at least 2 hours before it starts; the slot reopens for others. */
export const POST = studentRoute<{ id: string }>({ module: "STUDENT_PREP" }, async (_req, me, { id }) => {
  const slot = await db.counsellingSlot.findFirst({ where: { id, studentId: me.studentId, status: "BOOKED" } });
  if (!slot) throw notFound("Booking not found");
  if (slot.startsAt.getTime() - Date.now() < 2 * 3_600_000) throw new ApiError(409, "TOO_LATE", "Bookings can be cancelled up to 2 hours before the session");
  await db.counsellingSlot.update({ where: { id }, data: { status: "OPEN", studentId: null, topic: null } });
  return { id, status: "OPEN" };
});
