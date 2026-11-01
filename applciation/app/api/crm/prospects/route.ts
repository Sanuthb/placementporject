import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody, parseQuery } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ProspectStage } from "@/generated/prisma/client";

const query = z.object({ stage: z.enum(ProspectStage).optional(), ownerId: z.uuid().optional(), followUpDue: z.enum(["true", "false"]).default("false"), q: z.string().trim().max(100).optional(), limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.uuid().optional() });
const create = z.object({
  companyName: z.string().trim().min(2).max(200), industry: z.string().trim().max(100).optional(), contactName: z.string().trim().max(120).optional(), contactEmail: z.email().optional(), contactPhone: z.string().trim().max(30).optional(),
  notes: z.string().trim().max(5000).optional(), nextFollowUpAt: z.coerce.date().optional(), ownerId: z.uuid().optional(),
});

export const GET = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "EMPLOYER_CRM" }, async (req, s) => {
  const q = parseQuery(req, query);
  const rows = await db.prospect.findMany({
    where: { collegeId: s.collegeId, stage: q.stage, ownerId: q.ownerId, ...(q.followUpDue === "true" ? { nextFollowUpAt: { lte: new Date() }, stage: { notIn: ["WON", "LOST"] } } : {}), ...(q.q ? { companyName: { contains: q.q, mode: "insensitive" } } : {}) },
    include: { owner: { select: { id: true, name: true } } }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: q.limit + 1, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > q.limit;
  const items = hasMore ? rows.slice(0, q.limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
});

export const POST = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "EMPLOYER_CRM" }, async (req, s) => {
  const b = await parseBody(req, create);
  const ownerId = b.ownerId ?? s.userId;
  if (!(await db.user.findFirst({ where: { id: ownerId, collegeId: s.collegeId, isActive: true, role: { not: "DEPARTMENT_COORDINATOR" } } }))) throw badRequest("Owner must be an active admin or officer");
  return db.$transaction(async (tx) => {
    const p = await tx.prospect.create({ data: { ...b, ownerId, collegeId: s.collegeId } });
    await audit(s, { action: "prospect.create", entity: "Prospect", entityId: p.id, after: { companyName: p.companyName } }, tx);
    return p;
  });
});
