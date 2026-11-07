import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { badRequest, notFound } from "@/lib/api/errors";
import { removeOwned } from "@/lib/api/remove";
import { BATCH_STATUS } from "@/lib/api/academic";

const patch = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  branchId: z.uuid().nullable().optional(),
  coordinatorId: z.uuid().nullable().optional(),
  status: z.enum(BATCH_STATUS).optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = route<{ id: string }>({ roles: ["TPO_ADMIN"] }, async (req, s, { id }) => {
  const data = await parseBody(req, patch);
  return db.$transaction(async (tx) => {
    const before = await tx.batch.findFirst({ where: { id, collegeId: s.collegeId } });
    if (!before) throw notFound("Batch not found");
    if (data.branchId && !(await tx.programmeBranch.findFirst({ where: { id: data.branchId, programId: before.programId ?? undefined } }))) throw badRequest("That branch does not belong to this batch's programme");
    if (data.coordinatorId && !(await tx.user.findFirst({ where: { id: data.coordinatorId, collegeId: s.collegeId, isActive: true } }))) throw badRequest("Coordinator not found");
    // Archiving and deactivating are the same switch, so the two never disagree.
    const next = { ...data, ...(data.status ? { isActive: data.status !== "ARCHIVED" } : {}) };
    const after = await tx.batch.update({ where: { id }, data: next });
    await audit(s, { action: "batch.update", entity: "Batch", entityId: id, before: { name: before.name, status: before.status, isActive: before.isActive }, after: next }, tx);
    return after;
  });
});

export const DELETE = route<{ id: string }>({ roles: ["TPO_ADMIN"] }, (_req, s, { id }) => removeOwned(s, {
  entity: "Batch", label: "Batch", id, action: "batch.delete",
  find: (tx) => tx.batch.findFirst({ where: { id, collegeId: s.collegeId } }),
  blockers: async (tx) => { const n = await tx.student.count({ where: { batchId: id } }); return n ? `${n} students are in this batch.` : null; },
  remove: (tx) => tx.batch.delete({ where: { id } }),
}));
