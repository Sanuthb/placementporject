import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { db } from "@/lib/db";

const query = z.object({
  entity: z.string().optional(),
  entityId: z.string().optional(),
  actorId: z.uuid().optional(),
  action: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.uuid().optional(),
});

export const GET = route({ roles: ["TPO_ADMIN"] }, async (req, s) => {
  const q = parseQuery(req, query);
  const rows = await db.auditLog.findMany({
    where: {
      collegeId: s.collegeId,
      entity: q.entity,
      entityId: q.entityId,
      actorId: q.actorId,
      action: q.action ? { startsWith: q.action } : undefined,
      createdAt: { gte: q.from, lte: q.to },
    },
    include: { actor: { select: { id: true, name: true, email: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: q.limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > q.limit;
  const items = hasMore ? rows.slice(0, q.limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
});
