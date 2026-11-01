import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseQuery } from "@/lib/api/parse";
import { db } from "@/lib/db";

const query = z.object({ unreadOnly: z.enum(["true", "false"]).default("false"), limit: z.coerce.number().int().min(1).max(100).default(30), cursor: z.uuid().optional() });

export const GET = studentRoute({}, async (req, me) => {
  const q = parseQuery(req, query);
  const [rows, unread] = await Promise.all([
    db.notification.findMany({ where: { studentId: me.studentId, ...(q.unreadOnly === "true" ? { readAt: null } : {}) }, select: { id: true, type: true, title: true, body: true, link: true, readAt: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: q.limit + 1, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}) }),
    db.notification.count({ where: { studentId: me.studentId, readAt: null } }),
  ]);
  const hasMore = rows.length > q.limit;
  const items = hasMore ? rows.slice(0, q.limit) : rows;
  return { unread, items, nextCursor: hasMore ? items[items.length - 1].id : null };
});
