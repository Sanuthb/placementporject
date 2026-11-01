import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody, parseQuery } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { departmentScope } from "@/lib/auth/session";
import { createTicket, ticketInput } from "@/lib/tickets";
import { TicketCategory, TicketStatus } from "@/generated/prisma/client";

const query = z.object({
  status: z.enum(TicketStatus).optional(), category: z.enum(TicketCategory).optional(), assigneeId: z.uuid().optional(), mine: z.enum(["true", "false"]).default("false"),
  limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.uuid().optional(),
});

/** Ticket list with status, assignee and age. */
export const GET = route({}, async (req, s) => {
  const q = parseQuery(req, query);
  const rows = await db.ticket.findMany({
    where: { collegeId: s.collegeId, ...departmentScope(s), status: q.status, category: q.category, assigneeId: q.mine === "true" ? s.userId : q.assigneeId },
    select: { id: true, category: true, subject: true, status: true, section: true, createdAt: true, updatedAt: true, student: { select: { id: true, name: true, enrollmentNo: true } }, assignee: { select: { id: true, name: true } }, _count: { select: { messages: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: q.limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > q.limit;
  const items = (hasMore ? rows.slice(0, q.limit) : rows).map((t) => ({ ...t, ageHours: Math.floor((Date.now() - t.createdAt.getTime()) / 3_600_000) }));
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
});

/** Staff opening a ticket for a student (the student app will use the same logic). */
export const POST = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] }, async (req, s) => {
  const t = await createTicket(s, await parseBody(req, ticketInput));
  return { id: t.id, status: t.status };
});
