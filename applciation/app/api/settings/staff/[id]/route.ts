import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { badRequest, notFound } from "@/lib/api/errors";
import { assertAnotherAdmin, assertDepartment } from "@/lib/api/guards";
import { Role } from "@/generated/prisma/client";

const patch = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  role: z.enum(Role).optional(),
  departmentId: z.uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = route<{ id: string }>({ roles: ["TPO_ADMIN"] }, async (req, s, { id }) => {
  const data = await parseBody(req, patch);
  return db.$transaction(async (tx) => {
    const before = await tx.user.findFirst({ where: { id, collegeId: s.collegeId } });
    if (!before) throw notFound("Staff member not found");

    const role = data.role ?? before.role;
    const departmentId = data.departmentId === undefined ? before.departmentId : data.departmentId;
    if (role === "DEPARTMENT_COORDINATOR" && !departmentId) throw badRequest("A department is required for coordinators");
    if (role !== "DEPARTMENT_COORDINATOR" && departmentId) throw badRequest("Only coordinators belong to a department");
    if (departmentId) await assertDepartment(s.collegeId, departmentId, tx);

    const losingAdmin = before.role === "TPO_ADMIN" && before.isActive && (role !== "TPO_ADMIN" || data.isActive === false);
    if (losingAdmin) await assertAnotherAdmin(s.collegeId, id, tx);

    const after = await tx.user.update({
      where: { id },
      data: { name: data.name, role, departmentId, isActive: data.isActive },
      select: { id: true, email: true, name: true, role: true, departmentId: true, isActive: true },
    });
    await audit(s, {
      action: data.isActive === false ? "staff.deactivate" : "staff.update",
      entity: "User",
      entityId: id,
      before: { role: before.role, departmentId: before.departmentId, isActive: before.isActive },
      after: { role: after.role, departmentId: after.departmentId, isActive: after.isActive },
    }, tx);
    return after;
  });
});
