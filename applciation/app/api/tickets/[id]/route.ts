import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { ticketFor } from "@/lib/tickets";
import { ticketAttachments } from "@/lib/ticketFiles";

export const GET = route<{ id: string }>({}, async (_req, s, { id }) => {
  await ticketFor(s, id);
  const t = await db.ticket.findUniqueOrThrow({
    where: { id },
    include: { student: { select: { id: true, name: true, enrollmentNo: true } }, assignee: { select: { id: true, name: true } }, messages: { orderBy: { createdAt: "asc" } } },
  });
  return { ...t, attachments: await ticketAttachments(id) };
});
