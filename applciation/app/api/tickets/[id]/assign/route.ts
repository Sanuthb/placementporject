import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ticketFor } from "@/lib/tickets";

const body = z.object({ assigneeId: z.uuid().nullable() });

/** Reassign to staff. A department coordinator can only take tickets from their own department. */
export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] }, async (req, s, { id }) => {
  const { assigneeId } = await parseBody(req, body);
  const t = await ticketFor(s, id);
  if (assigneeId) {
    const u = await db.user.findFirst({ where: { id: assigneeId, collegeId: s.collegeId, isActive: true } });
    if (!u) throw badRequest("Assignee not found or inactive");
    if (u.role === "DEPARTMENT_COORDINATOR" && u.departmentId !== t.departmentId) throw badRequest("That coordinator belongs to a different department");
  }
  return db.$transaction(async (tx) => {
    await tx.ticket.update({ where: { id }, data: { assigneeId } });
    await audit(s, { action: "ticket.assign", entity: "Ticket", entityId: id, before: { assigneeId: t.assigneeId }, after: { assigneeId } }, tx);
    if (assigneeId && assigneeId !== s.userId) await tx.notification.create({ data: { collegeId: s.collegeId, userId: assigneeId, type: "ticket.assigned", title: `Ticket assigned to you: ${t.subject}`, link: `/tickets/${id}` } });
    return { id, assigneeId };
  });
});
