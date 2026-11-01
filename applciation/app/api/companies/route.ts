import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody, parseQuery } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { contactSchema } from "@/lib/companies";
import { CompanyTier, RelationshipStatus } from "@/generated/prisma/client";

const query = z.object({
  q: z.string().trim().max(100).optional(),
  tier: z.enum(CompanyTier).optional(),
  relationshipStatus: z.enum(RelationshipStatus).optional(),
  includeInactive: z.enum(["true", "false"]).default("false"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.uuid().optional(),
});
const create = z.object({
  name: z.string().trim().min(2).max(200),
  industry: z.string().trim().max(100).optional(),
  website: z.url().optional(),
  tier: z.enum(CompanyTier).default("REGULAR"),
  contacts: z.array(contactSchema).max(20).default([]),
});

export const GET = route({ module: "DRIVES" }, async (req, s) => {
  const q = parseQuery(req, query);
  const rows = await db.company.findMany({
    where: { collegeId: s.collegeId, tier: q.tier, relationshipStatus: q.relationshipStatus, ...(q.includeInactive === "true" ? {} : { isActive: true }), ...(q.q ? { name: { contains: q.q, mode: "insensitive" } } : {}) },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: q.limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > q.limit;
  const items = hasMore ? rows.slice(0, q.limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
});

export const POST = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (req, s) => {
  const data = await parseBody(req, create);
  if (await db.company.findUnique({ where: { collegeId_name: { collegeId: s.collegeId, name: data.name } } })) throw new ApiError(409, "CONFLICT", "A company with this name already exists");
  return db.$transaction(async (tx) => {
    const c = await tx.company.create({ data: { ...data, collegeId: s.collegeId } });
    await audit(s, { action: "company.create", entity: "Company", entityId: c.id, after: { name: c.name, tier: c.tier } }, tx);
    return c;
  });
});
