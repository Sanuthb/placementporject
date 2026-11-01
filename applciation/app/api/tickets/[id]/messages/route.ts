import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { notifyStudent } from "@/lib/notify";
import { ticketFor } from "@/lib/tickets";

const body = z.object({ body: z.string().trim().min(1).max(5000) });

/** Reply to the student. The first staff reply moves an open ticket to in progress. */
export const POST = route<{ id: string }>({}, async (req, s, { id }) => {
  const { body: text } = await parseBody(req, body);
  const t = await ticketFor(s, id);
  if (t.status === "RESOLVED") throw new ApiError(409, "CONFLICT", "This ticket is resolved");
  return db.$transaction(async (tx) => {
    const m = await tx.ticketMessage.create({ data: { ticketId: id, authorUserId: s.userId, body: text } });
    if (t.status === "OPEN") await tx.ticket.update({ where: { id }, data: { status: "IN_PROGRESS" } });
    await notifyStudent(s.collegeId, t.studentId, { type: "ticket.reply", title: `Reply on your request: ${t.subject}`, body: text.slice(0, 200), link: `/tickets/${id}` }, tx);
    return { id: m.id };
  });
});
