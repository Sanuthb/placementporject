import { studentRoute } from "@/lib/api/studentHandler";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { ticketAttachments } from "@/lib/ticketFiles";

export const GET = studentRoute<{ id: string }>({}, async (_req, me, { id }) => {
  const t = await db.ticket.findFirst({ where: { id, studentId: me.studentId }, select: { id: true, category: true, subject: true, status: true, section: true, createdAt: true, resolvedAt: true, messages: { select: { id: true, body: true, createdAt: true, authorStudentId: true }, orderBy: { createdAt: "asc" } } } });
  if (!t) throw notFound("Ticket not found");
  return { ...t, attachments: await ticketAttachments(id), messages: t.messages.map(({ authorStudentId, ...m }) => ({ ...m, fromMe: !!authorStudentId })) };
});
