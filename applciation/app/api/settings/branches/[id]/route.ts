import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notFound } from "@/lib/api/errors";
import { removeOwned } from "@/lib/api/remove";

const patch = z.object({ name: z.string().trim().min(2).max(80).optional(), isActive: z.boolean().optional() });

export const PATCH = route<{ id: string }>({ roles: ["TPO_ADMIN"] }, async (req, s, { id }) => {
  const data = await parseBody(req, patch);
  return db.$transaction(async (tx) => {
    const before = await tx.programmeBranch.findFirst({ where: { id, collegeId: s.collegeId } });
    if (!before) throw notFound("Branch not found");
    const after = await tx.programmeBranch.update({ where: { id }, data });
    await audit(s, { action: "branch.update", entity: "ProgrammeBranch", entityId: id, before: { name: before.name, isActive: before.isActive }, after: data }, tx);
    return after;
  });
});

export const DELETE = route<{ id: string }>({ roles: ["TPO_ADMIN"] }, (_req, s, { id }) => removeOwned(s, {
  entity: "ProgrammeBranch", label: "Branch", id, action: "branch.delete",
  find: (tx) => tx.programmeBranch.findFirst({ where: { id, collegeId: s.collegeId } }),
  blockers: async (tx) => {
    const [students, batches] = await Promise.all([tx.student.count({ where: { branchId: id } }), tx.batch.count({ where: { branchId: id } })]);
    return students || batches ? `${students} students and ${batches} batches use this branch.` : null;
  },
  remove: (tx) => tx.programmeBranch.delete({ where: { id } }),
}));
