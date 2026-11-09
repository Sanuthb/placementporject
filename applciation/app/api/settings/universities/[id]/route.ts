import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError, notFound } from "@/lib/api/errors";
import { removeOwned } from "@/lib/api/remove";
import { universityBase } from "@/lib/api/academic";

const patch = universityBase.partial().extend({ isActive: z.boolean().optional() });

export const PATCH = route<{ id: string }>({ roles: ["TPO_ADMIN"] }, async (req, s, { id }) => {
  const data = await parseBody(req, patch);
  return db.$transaction(async (tx) => {
    const before = await tx.university.findFirst({ where: { id, collegeId: s.collegeId } });
    if (!before) throw notFound("University not found");
    if (data.code && data.code !== before.code && (await tx.university.findFirst({ where: { collegeId: s.collegeId, code: data.code } }))) throw new ApiError(409, "CONFLICT", "A university with this code already exists");
    if (data.name && (await tx.university.findFirst({ where: { collegeId: s.collegeId, id: { not: id }, name: { equals: data.name, mode: "insensitive" } } }))) throw new ApiError(409, "CONFLICT", "A university with this name already exists");
    const after = await tx.university.update({ where: { id }, data });
    // Programmes keep the legacy text in step with the record they point at.
    if (data.name && data.name !== before.name) await tx.program.updateMany({ where: { universityId: id, collegeId: s.collegeId }, data: { university: data.name } });
    await audit(s, { action: data.isActive === false ? "university.deactivate" : "university.update", entity: "University", entityId: id, before: { name: before.name, code: before.code, website: before.website, isActive: before.isActive }, after: data }, tx);
    return after;
  });
});

export const DELETE = route<{ id: string }>({ roles: ["TPO_ADMIN"] }, (_req, s, { id }) => removeOwned(s, {
  entity: "University", label: "University", id, action: "university.delete",
  find: (tx) => tx.university.findFirst({ where: { id, collegeId: s.collegeId } }),
  blockers: async (tx) => { const n = await tx.program.count({ where: { universityId: id } }); return n ? `${n} programmes are affiliated to this university.` : null; },
  remove: (tx) => tx.university.delete({ where: { id } }),
}));
