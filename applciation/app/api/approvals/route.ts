import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { ApprovalStatus } from "@/generated/prisma/client";

const query = z.object({ status: z.enum(ApprovalStatus).optional(), limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.uuid().optional() });

/** Approvers (TPO admins) see every request; everyone else sees their own. */
export const GET = route({}, async (req, s) => {
  const q = parseQuery(req, query);
  const rows = await db.approvalRequest.findMany({
    where: { collegeId: s.collegeId, status: q.status, ...(s.role === "TPO_ADMIN" ? {} : { requestedById: s.userId }) },
    select: { id: true, action: true, status: true, summary: true, createdAt: true, decidedAt: true, decisionComment: true, requestedBy: { select: { id: true, name: true } }, decidedBy: { select: { id: true, name: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: q.limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > q.limit;
  const items = hasMore ? rows.slice(0, q.limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
});
