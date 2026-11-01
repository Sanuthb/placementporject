import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

const body = z.object({ reason: z.string().trim().min(3).max(500) });

export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "EVENTS" }, async (req, s, { id }) => {
  const { reason } = await parseBody(req, body);
  return db.$transaction(async (tx) => {
    const claim = await tx.event.updateMany({ where: { id, collegeId: s.collegeId, status: { in: ["DRAFT", "PUBLISHED"] } }, data: { status: "CANCELLED" } });
    if (claim.count === 0) throw new ApiError(409, "CONFLICT", "Only draft or published events can be cancelled");
    const regs = await tx.eventRegistration.findMany({ where: { eventId: id, status: { in: ["REGISTERED", "WAITLISTED"] } }, select: { studentId: true } });
    if (regs.length) await tx.notification.createMany({ data: regs.map((r) => ({ collegeId: s.collegeId, studentId: r.studentId, type: "event.cancelled", title: "An event you registered for was cancelled", body: reason })) });
    await audit(s, { action: "event.cancel", entity: "Event", entityId: id, reason }, tx);
    return { id, status: "CANCELLED", notified: regs.length };
  });
});
