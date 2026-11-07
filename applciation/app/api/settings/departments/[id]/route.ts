import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notFound } from "@/lib/api/errors";
import { removeOwned } from "@/lib/api/remove";

const patch = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  code: z.string().trim().toUpperCase().min(1).max(20).optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = route<{ id: string }>({ roles: ["TPO_ADMIN"] }, async (req, s, { id }) => {
  const data = await parseBody(req, patch);
  return db.$transaction(async (tx) => {
    const before = await tx.department.findFirst({ where: { id, collegeId: s.collegeId } });
    if (!before) throw notFound("Department not found");
    const after = await tx.department.update({ where: { id }, data });
    await audit(s, { action: data.isActive === false ? "department.deactivate" : "department.update", entity: "Department", entityId: id, before: { name: before.name, code: before.code, isActive: before.isActive }, after: data }, tx);
    return after;
  });
});

export const DELETE = route<{ id: string }>({ roles: ["TPO_ADMIN"] }, (_req, s, { id }) => removeOwned(s, {
  entity: "Department", label: "Department", id, action: "department.delete",
  find: (tx) => tx.department.findFirst({ where: { id, collegeId: s.collegeId } }),
  blockers: async (tx) => {
    const [students, users] = await Promise.all([tx.student.count({ where: { departmentId: id } }), tx.user.count({ where: { departmentId: id } })]);
    return students || users ? `${students} students and ${users} staff belong to this department.` : null;
  },
  remove: (tx) => tx.department.delete({ where: { id } }),
}));
