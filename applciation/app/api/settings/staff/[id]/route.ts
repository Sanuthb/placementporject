import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { badRequest, notFound } from "@/lib/api/errors";
import { assertAnotherAdmin, assertDepartment } from "@/lib/api/guards";
import { rolesSchema, splitRoles, withRoles } from "@/lib/api/staffRoles";

const patch = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  roles: rolesSchema.optional(),
  departmentId: z.uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = route<{ id: string }>({ roles: ["TPO_ADMIN"] }, async (req, s, { id }) => {
  const data = await parseBody(req, patch);
  return db.$transaction(async (tx) => {
    const before = await tx.user.findFirst({ where: { id, collegeId: s.collegeId } });
    if (!before) throw notFound("Staff member not found");

    const beforeRoles = [before.role, ...before.extraRoles];
    const roles = data.roles ?? beforeRoles;
    const departmentId = data.departmentId === undefined ? before.departmentId : data.departmentId;
    const coordinator = roles.includes("DEPARTMENT_COORDINATOR");
    if (coordinator && !departmentId) throw badRequest("A department is required for the Department Coordinator role");
    if (!coordinator && departmentId) throw badRequest("Only coordinators belong to a department");
    if (departmentId) await assertDepartment(s.collegeId, departmentId, tx);

    const wasAdmin = beforeRoles.includes("TPO_ADMIN") && before.isActive;
    if (wasAdmin && (!roles.includes("TPO_ADMIN") || data.isActive === false)) await assertAnotherAdmin(s.collegeId, id, tx);

    const after = await tx.user.update({
      where: { id },
      data: { name: data.name, ...(data.roles ? splitRoles(roles) : {}), departmentId, isActive: data.isActive },
      select: { id: true, email: true, name: true, role: true, extraRoles: true, departmentId: true, isActive: true },
    });
    await audit(s, {
      action: data.isActive === false ? "staff.deactivate" : "staff.update",
      entity: "User",
      entityId: id,
      before: { roles: beforeRoles, departmentId: before.departmentId, isActive: before.isActive },
      after: { roles: [after.role, ...after.extraRoles], departmentId: after.departmentId, isActive: after.isActive },
    }, tx);
    return withRoles(after);
  });
});
