import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyStudent } from "@/lib/notify";
import { ticketFor } from "@/lib/tickets";

const body = z.object({ message: z.string().trim().max(5000).optional() });

export const POST = route<{ id: string }>({}, async (req, s, { id }) => {
  const { message } = await parseBody(req, body.default({}));
  const t = await ticketFor(s, id);
  return db.$transaction(async (tx) => {
    const claim = await tx.ticket.updateMany({ where: { id, status: { not: "RESOLVED" } }, data: { status: "RESOLVED", resolvedAt: new Date() } });
    if (claim.count === 0) throw new ApiError(409, "CONFLICT", "This ticket is already resolved");
    if (message) await tx.ticketMessage.create({ data: { ticketId: id, authorUserId: s.userId, body: message } });
    await audit(s, { action: "ticket.resolve", entity: "Ticket", entityId: id }, tx);
    await notifyStudent(s.collegeId, t.studentId, { type: "ticket.resolved", title: `Your request was resolved: ${t.subject}`, link: `/tickets/${id}` }, tx);
    return { id, status: "RESOLVED" };
  });
});
