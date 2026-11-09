import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { badRequest } from "@/lib/api/errors";

type Tx = Prisma.TransactionClient | typeof db;

/** Ensures a department belongs to the caller's college and is active. */
export async function assertDepartment(collegeId: string, departmentId: string, tx: Tx = db) {
  const d = await tx.department.findFirst({ where: { id: departmentId, collegeId, isActive: true } });
  if (!d) throw badRequest("Department not found or inactive");
}

/** A college must always keep at least one active TPO admin. */
export async function assertAnotherAdmin(collegeId: string, excludeUserId: string, tx: Tx = db) {
  const others = await tx.user.count({
    where: { collegeId, OR: [{ role: "TPO_ADMIN" }, { extraRoles: { has: "TPO_ADMIN" } }], isActive: true, id: { not: excludeUserId } },
  });
  if (others === 0) throw badRequest("The college must keep at least one active TPO admin");
}
