import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { MessageStatus } from "@/generated/prisma/client";

const query = z.object({ status: z.enum(MessageStatus).optional(), purpose: z.string().optional(), studentId: z.uuid().optional(), limit: z.coerce.number().int().min(1).max(200).default(50), cursor: z.uuid().optional() });

/** History of messages sent and to whom. */
export const GET = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] }, async (req, s) => {
  const q = parseQuery(req, query);
  const rows = await db.messageLog.findMany({
    where: { collegeId: s.collegeId, status: q.status, purpose: q.purpose, studentId: q.studentId },
    select: { id: true, purpose: true, subject: true, recipientEmail: true, status: true, error: true, createdAt: true },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: q.limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > q.limit;
  const items = hasMore ? rows.slice(0, q.limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
});
