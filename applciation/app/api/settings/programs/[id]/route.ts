import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notFound } from "@/lib/api/errors";

const patch = z.object({ name: z.string().trim().min(2).max(120).optional(), isActive: z.boolean().optional() });

export const PATCH = route<{ id: string }>({ roles: ["TPO_ADMIN"] }, async (req, s, { id }) => {
  const data = await parseBody(req, patch);
  return db.$transaction(async (tx) => {
    const before = await tx.program.findFirst({ where: { id, collegeId: s.collegeId } });
    if (!before) throw notFound("Program not found");
    const after = await tx.program.update({ where: { id }, data });
    await audit(s, { action: "program.update", entity: "Program", entityId: id, before: { name: before.name, isActive: before.isActive }, after: data }, tx);
    return after;
  });
});
