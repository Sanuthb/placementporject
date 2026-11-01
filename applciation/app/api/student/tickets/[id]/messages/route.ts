import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { ApiError, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { notifyStaff } from "@/lib/notify";

const body = z.object({ body: z.string().trim().min(1).max(5000) });

export const POST = studentRoute<{ id: string }>({ limit: { name: "ticket-msg", max: 60, windowSec: 3600 } }, async (req, me, { id }) => {
  const { body: text } = await parseBody(req, body);
  const t = await db.ticket.findFirst({ where: { id, studentId: me.studentId } });
  if (!t) throw notFound("Ticket not found");
  if (t.status === "RESOLVED") throw new ApiError(409, "CONFLICT", "This request is resolved. Raise a new one if you still need help");
  return db.$transaction(async (tx) => {
    const m = await tx.ticketMessage.create({ data: { ticketId: id, authorStudentId: me.studentId, body: text } });
    if (t.assigneeId) await tx.notification.create({ data: { collegeId: me.collegeId, userId: t.assigneeId, type: "ticket.reply", title: `${me.name} replied: ${t.subject}`, link: `/tickets/${id}` } });
    else await notifyStaff(me.collegeId, { type: "ticket.reply", title: `${me.name} replied: ${t.subject}`, link: `/tickets/${id}`, departmentId: t.departmentId }, tx);
    return { id: m.id };
  });
});
