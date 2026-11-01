import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { paramSchemas } from "@/lib/blocking";
import { BlockPolicyType } from "@/generated/prisma/client";

const create = z.object({ type: z.enum(BlockPolicyType), name: z.string().trim().min(2).max(120), params: z.record(z.string(), z.unknown()).default({}) });

/** Max offers per student lives in /api/settings/policies; the two policy types here are the automatic ones. */
export const GET = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ATTENDANCE_BLOCKING" }, (_req, s) => db.blockPolicy.findMany({ where: { collegeId: s.collegeId }, orderBy: { createdAt: "asc" } }));

export const POST = route({ roles: ["TPO_ADMIN"], module: "ATTENDANCE_BLOCKING" }, async (req, s) => {
  const b = await parseBody(req, create);
  const parsed = paramSchemas[b.type].safeParse(b.params);
  if (!parsed.success) throw badRequest("Invalid policy parameters", parsed.error.issues);
  if (b.type === "PLACED_LOWER_TIER" && (await db.blockPolicy.count({ where: { collegeId: s.collegeId, type: b.type } }))) throw badRequest("This policy already exists; activate or deactivate it instead");
  return db.$transaction(async (tx) => {
    const p = await tx.blockPolicy.create({ data: { collegeId: s.collegeId, type: b.type, name: b.name, params: parsed.data as object } });
    await audit(s, { action: "blockPolicy.create", entity: "BlockPolicy", entityId: p.id, after: { type: b.type, params: parsed.data as object } }, tx);
    return p;
  });
});
