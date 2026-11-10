import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody, parseQuery } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { RES_STAFF } from "@/lib/resourceService";
import { expiryState } from "@/lib/resources";
import { ResourceCategory, ResourceDifficulty, ResourceStatus, ResourceType, ResourceVisibility } from "@/generated/prisma/client";

const list = (v: string[] | undefined) => (v ?? []).map((x) => x.trim()).filter(Boolean);
const tags = z.array(z.string().trim().min(1).max(60)).max(20);
export const metaFields = z.object({
  title: z.string().trim().min(3).max(200), description: z.string().trim().max(3000).nullish(), category: z.enum(ResourceCategory), type: z.enum(ResourceType),
  url: z.url().max(1000).nullish(), subject: z.string().trim().max(100).nullish(), topic: z.string().trim().max(100).nullish(), skills: tags.optional(), jobRoles: tags.optional(),
  companyName: z.string().trim().max(100).nullish(), difficulty: z.enum(ResourceDifficulty).nullish(), language: z.string().trim().min(2).max(40).optional(),
  durationMin: z.number().int().min(1).max(3000).nullish(), expiresAt: z.coerce.date().nullish(), visibility: z.enum(ResourceVisibility).optional(),
});
export const clean = <T extends { skills?: string[]; jobRoles?: string[] }>(b: T) => ({ ...b, ...(b.skills ? { skills: list(b.skills) } : {}), ...(b.jobRoles ? { jobRoles: list(b.jobRoles) } : {}) });

const query = z.object({ status: z.enum(ResourceStatus).optional(), type: z.enum(ResourceType).optional(), category: z.enum(ResourceCategory).optional(), q: z.string().trim().max(100).optional(), expiring: z.enum(["true"]).optional() });

/** The library for staff, with filters. `expiring=true` shows resources that are expired or expire within 14 days. */
export const GET = route(RES_STAFF, async (req, s) => {
  const q = parseQuery(req, query);
  const rows = await db.prepResource.findMany({
    where: { collegeId: s.collegeId, status: q.status, type: q.type, category: q.category, ...(q.q ? { OR: [{ title: { contains: q.q, mode: "insensitive" } }, { subject: { contains: q.q, mode: "insensitive" } }, { topic: { contains: q.q, mode: "insensitive" } }, { skills: { has: q.q } }] } : {}), ...(q.expiring ? { expiresAt: { lt: new Date(Date.now() + 14 * 86_400_000) } } : {}) },
    orderBy: { updatedAt: "desc" }, take: 500, include: { _count: { select: { assignments: true, progress: true } } },
  });
  return rows.map(({ filePath, ...r }) => ({ ...r, hasFile: !!filePath, expiry: expiryState(r.expiresAt) }));
});

/** Adds a resource as a draft. A file is attached afterwards (POST .../file); a link goes in `url`. */
export const POST = route(RES_STAFF, async (req, s) => {
  const b = clean(await parseBody(req, metaFields));
  const r = await db.prepResource.create({ data: { ...b, collegeId: s.collegeId, uploadedById: s.userId } });
  await audit(s, { action: "resource.create", entity: "PrepResource", entityId: r.id, after: { title: r.title, type: r.type } });
  return r;
});
