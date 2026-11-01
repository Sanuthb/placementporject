import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { paramSchemas } from "@/lib/blocking";

const patch = z.object({ name: z.string().trim().min(2).max(120).optional(), params: z.record(z.string(), z.unknown()).optional(), isActive: z.boolean().optional() });

export const PATCH = route<{ id: string }>({ roles: ["TPO_ADMIN"], module: "ATTENDANCE_BLOCKING" }, async (req, s, { id }) => {
  const b = await parseBody(req, patch);
  const before = await db.blockPolicy.findFirst({ where: { id, collegeId: s.collegeId } });
  if (!before) throw notFound("Policy not found");
  let params: object | undefined;
  if (b.params) {
    const parsed = paramSchemas[before.type].safeParse(b.params);
    if (!parsed.success) throw badRequest("Invalid policy parameters", parsed.error.issues);
    params = parsed.data;
  }
  return db.$transaction(async (tx) => {
    const after = await tx.blockPolicy.update({ where: { id }, data: { name: b.name, isActive: b.isActive, params } });
    await audit(s, { action: "blockPolicy.update", entity: "BlockPolicy", entityId: id, before: { isActive: before.isActive, params: before.params as object }, after: { isActive: after.isActive, params: after.params as object } }, tx);
    return after;
  });
});
