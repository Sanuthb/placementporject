import { route } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";

/** Cancels a slot. If a student had booked it, they are told. */
export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "STUDENT_PREP" }, async (_req, s, { id }) => {
  return db.$transaction(async (tx) => {
    const slot = await tx.counsellingSlot.findFirst({ where: { id, collegeId: s.collegeId, status: { in: ["OPEN", "BOOKED"] } } });
    if (!slot) throw new ApiError(409, "CONFLICT", "Only open or booked slots can be cancelled");
    await tx.counsellingSlot.update({ where: { id }, data: { status: "CANCELLED" } });
    if (slot.studentId) await tx.notification.create({ data: { collegeId: s.collegeId, studentId: slot.studentId, type: "counselling.cancelled", title: "Your counselling session was cancelled", body: "Please book another slot." } });
    return { id, status: "CANCELLED" };
  });
});
