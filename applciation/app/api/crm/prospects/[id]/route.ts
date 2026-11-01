import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

const patch = z.object({
  industry: z.string().trim().max(100).nullable().optional(), contactName: z.string().trim().max(120).nullable().optional(), contactEmail: z.email().nullable().optional(), contactPhone: z.string().trim().max(30).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(), nextFollowUpAt: z.coerce.date().nullable().optional(), ownerId: z.uuid().optional(),
});

export const GET = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "EMPLOYER_CRM" }, async (_req, s, { id }) => {
  const p = await db.prospect.findFirst({ where: { id, collegeId: s.collegeId }, include: { owner: { select: { id: true, name: true } }, activities: { orderBy: { createdAt: "desc" }, take: 100 } } });
  if (!p) throw notFound("Prospect not found");
  return p;
});

export const PATCH = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "EMPLOYER_CRM" }, async (req, s, { id }) => {
  const data = await parseBody(req, patch);
  if (data.ownerId && !(await db.user.findFirst({ where: { id: data.ownerId, collegeId: s.collegeId, isActive: true, role: { not: "DEPARTMENT_COORDINATOR" } } }))) throw badRequest("Owner must be an active admin or officer");
  return db.$transaction(async (tx) => {
    const r = await tx.prospect.updateMany({ where: { id, collegeId: s.collegeId }, data });
    if (r.count === 0) throw notFound("Prospect not found");
    await audit(s, { action: "prospect.update", entity: "Prospect", entityId: id }, tx);
    return tx.prospect.findUniqueOrThrow({ where: { id } });
  });
});
