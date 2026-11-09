import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError, notFound } from "@/lib/api/errors";

const patch = z.object({ name: z.string().trim().min(2).max(120).optional(), code: z.string().trim().toUpperCase().max(20).nullable().optional(), isActive: z.boolean().optional() });

export const PATCH = route<{ id: string }>({ roles: ["TPO_ADMIN"] }, async (req, s, { id }) => {
  const data = await parseBody(req, patch);
  const r = await db.campus.updateMany({ where: { id, collegeId: s.collegeId }, data });
  if (r.count === 0) throw notFound("Campus not found");
  await audit(s, { action: "campus.update", entity: "Campus", entityId: id, after: data });
  return db.campus.findUniqueOrThrow({ where: { id } });
});

export const DELETE = route<{ id: string }>({ roles: ["TPO_ADMIN"] }, async (_req, s, { id }) => {
  const c = await db.campus.findFirst({ where: { id, collegeId: s.collegeId }, include: { _count: { select: { students: true, invitations: true } } } });
  if (!c) throw notFound("Campus not found");
  if (c._count.students || c._count.invitations) throw new ApiError(409, "IN_USE", "Students are assigned to this campus. Deactivate it instead");
  await db.campus.delete({ where: { id } });
  await audit(s, { action: "campus.delete", entity: "Campus", entityId: id, before: { name: c.name } });
  return { deleted: true };
});
