import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/rateLimit";
import { ApiError, badRequest, notFound } from "@/lib/api/errors";
import { assertAnotherAdmin, assertDepartment } from "@/lib/api/guards";
import { rolesSchema, splitRoles } from "@/lib/api/staffRoles";
import { escapeLike } from "@/lib/platformList";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { PlatformSession } from "@/lib/auth/platform";

/**
 * Access administration for platform administrators (Gate 4, SA-TC-004 / 067, approved scope "A + B"):
 *  - assign the EXISTING institution roles (and extra roles) to an institution's staff. No custom roles and no editable permission rules.
 *  - list and DEACTIVATE existing platform administrators. Accounts are created by script only (DEC-01); there is no API to create or re-enable one.
 * Guard rails: a platform administrator can never change their own record, the last active institution administrator and the last active platform administrator can never be removed, and every change is audited.
 * Two-step sign-in is enforced by platformRoute before any of this runs.
 */
const uuid = z.uuid();
export const parseUuid = (v: string, what: string) => { if (!uuid.safeParse(v).success) throw notFound(`${what} not found`); return v; };

// ---------------- institution staff roles ----------------
export const staffQuery = z.object({ q: z.string().trim().max(100).optional(), page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) });
export const staffRolesInput = z.object({ roles: rolesSchema, departmentId: z.uuid().nullable().optional() }).strict();

export async function listStaff(collegeId: string, q: z.infer<typeof staffQuery>) {
  if (!(await db.college.findUnique({ where: { id: collegeId }, select: { id: true } }))) throw notFound("Institution not found");
  const like = q.q ? escapeLike(q.q) : "";
  const where: Prisma.UserWhereInput = { collegeId, ...(q.q ? { OR: [{ name: { contains: like, mode: "insensitive" } }, { email: { contains: like, mode: "insensitive" } }] } : {}) };
  const [total, rows] = await Promise.all([db.user.count({ where }), db.user.findMany({ where, orderBy: [{ name: "asc" }, { id: "asc" }], skip: (q.page - 1) * q.pageSize, take: q.pageSize, select: { id: true, name: true, email: true, role: true, extraRoles: true, departmentId: true, isActive: true, department: { select: { name: true } } } })]);
  const departments = await db.department.findMany({ where: { collegeId }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return { departments, items: rows.map(({ department, role, extraRoles, ...u }) => ({ ...u, roles: [role, ...extraRoles.filter((r) => r !== role)], departmentName: department?.name ?? null })), page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) };
}

export async function setStaffRoles(admin: PlatformSession, collegeId: string, userId: string, input: z.infer<typeof staffRolesInput>) {
  if (userId === admin.adminId) throw new ApiError(403, "FORBIDDEN", "You cannot change your own access");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${"staff-roles:" + collegeId}))`; // role changes in one institution take turns, so "keep one administrator" cannot be raced
    const locked = await tx.$queryRaw<{ id: string }[]>`select id from "User" where id = ${userId}::uuid and "collegeId" = ${collegeId}::uuid for update`; // a user of ANOTHER institution is simply not found
    if (!locked.length) throw notFound("Staff member not found");
    const before = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const beforeRoles = [before.role, ...before.extraRoles];
    const roles = input.roles;
    const departmentId = input.departmentId === undefined ? (roles.includes("DEPARTMENT_COORDINATOR") ? before.departmentId : null) : input.departmentId;
    if (roles.includes("DEPARTMENT_COORDINATOR") && !departmentId) throw badRequest("A department is required for the Department Coordinator role");
    if (!roles.includes("DEPARTMENT_COORDINATOR") && departmentId) throw badRequest("Only coordinators belong to a department");
    if (departmentId) await assertDepartment(collegeId, departmentId, tx);
    const wasAdmin = beforeRoles.includes("TPO_ADMIN") && before.isActive;
    if (wasAdmin && !roles.includes("TPO_ADMIN")) await assertAnotherAdmin(collegeId, userId, tx); // the institution must keep an administrator
    const same = beforeRoles.join() === roles.join() && before.departmentId === departmentId;
    if (same) return { id: userId, roles, departmentId, changed: false };
    const after = await tx.user.update({ where: { id: userId }, data: { ...splitRoles(roles), departmentId }, select: { id: true, role: true, extraRoles: true, departmentId: true } });
    await audit({ collegeId, userId: null, platformActorId: admin.adminId }, { action: "staff.roles.platform_update", entity: "User", entityId: userId, before: { roles: beforeRoles, departmentId: before.departmentId }, after: { roles: [after.role, ...after.extraRoles], departmentId: after.departmentId } }, tx);
    return { id: userId, roles: [after.role, ...after.extraRoles], departmentId: after.departmentId, changed: true };
  });
}

// ---------------- platform administrators ----------------
/** Writes the platform audit row inside the same transaction as the change, so a change and its record commit or fail together. */
const log = (tx: Prisma.TransactionClient, a: PlatformSession, action: string, detail: Prisma.InputJsonValue, req?: Request) =>
  tx.platformAuditLog.create({ data: { adminId: a.adminId, email: a.email, action, detail, ip: req ? clientIp(req) : null } });
const lockAdmins = (tx: Prisma.TransactionClient) => tx.$executeRaw`select pg_advisory_xact_lock(hashtext('platform-admins'))`; // removals take turns, so "keep at least one" cannot be raced

export async function listAdmins() {
  const rows = await db.platformAdmin.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, email: true, name: true, isActive: true, createdAt: true } });
  return Promise.all(rows.map(async (a) => {
    const f = await supabaseAdmin().auth.admin.mfa.listFactors({ userId: a.id }).catch(() => null);
    return { ...a, mfaEnrolled: f && !f.error ? (f.data?.factors ?? []).some((x) => x.status === "verified") : null };
  }));
}

/** Removal switches the administrator off (their sign-in stops working on the next request); the record and the audit history are kept. */
export async function removeAdmin(admin: PlatformSession, targetId: string, req?: Request) {
  if (targetId === admin.adminId) throw new ApiError(409, "SELF_REMOVAL", "You cannot remove yourself. Ask another platform administrator.");
  return db.$transaction(async (tx) => {
    await lockAdmins(tx);
    const t = await tx.platformAdmin.findUnique({ where: { id: targetId } });
    if (!t) throw notFound("Platform administrator not found");
    if (!t.isActive) throw new ApiError(409, "CONFLICT", "This administrator is already removed");
    if ((await tx.platformAdmin.count({ where: { isActive: true, id: { not: targetId } } })) === 0) throw new ApiError(409, "LAST_ADMIN", "The platform must keep at least one active administrator");
    await tx.platformAdmin.update({ where: { id: targetId }, data: { isActive: false } });
    await log(tx, admin, "platform.admin.remove", { target: t.email, targetId }, req);
    return { id: targetId, isActive: false };
  });
}
