import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { db } from "@/lib/db";

const query = z.object({ unreadOnly: z.enum(["true", "false"]).default("false"), limit: z.coerce.number().int().min(1).max(100).default(30), cursor: z.uuid().optional() });

/** The signed-in staff member's notifications, newest first, with the unread count. */
export const GET = route({}, async (req, s) => {
  const q = parseQuery(req, query);
  const where = { userId: s.userId, ...(q.unreadOnly === "true" ? { readAt: null } : {}) };
  const [rows, unread] = await Promise.all([
    db.notification.findMany({ where, select: { id: true, type: true, title: true, body: true, link: true, readAt: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: q.limit + 1, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}) }),
    db.notification.count({ where: { userId: s.userId, readAt: null } }),
  ]);
  const hasMore = rows.length > q.limit;
  const items = hasMore ? rows.slice(0, q.limit) : rows;
  return { unread, items, nextCursor: hasMore ? items[items.length - 1].id : null };
});
