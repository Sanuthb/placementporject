import type { NextRequest } from "next/server";
import type { ModuleKey, Role } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { forbidden, unauthorized } from "@/lib/api/errors";
import { verifyToken } from "@/lib/auth/verifyToken";

export type Session = {
  userId: string;
  collegeId: string;
  role: Role;
  departmentId: string | null;
  email: string;
  name: string;
};

/** Verifies the Supabase JWT and loads the app user. Rejects inactive users and colleges. */
export async function getSession(req: NextRequest): Promise<Session> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw unauthorized();

  const userId = await verifyToken(token);

  const user = await db.user.findUnique({
    where: { id: userId },
    include: { college: { select: { isActive: true } } },
  });
  if (!user || !user.isActive || !user.college.isActive) throw forbidden("Account is not active");

  return {
    userId: user.id,
    collegeId: user.collegeId,
    role: user.role,
    departmentId: user.departmentId,
    email: user.email,
    name: user.name,
  };
}

export function requireRole(session: Session, ...roles: Role[]) {
  if (!roles.includes(session.role)) throw forbidden();
}

/** Server-side module gating: a college only reaches modules it has bought (spec rule 12.1). */
export async function requireModule(session: { collegeId: string }, module: ModuleKey) {
  const row = await db.collegeModule.findUnique({
    where: { collegeId_module: { collegeId: session.collegeId, module } },
  });
  if (!row?.enabled) throw forbidden(`The ${module} module is not enabled for this college`);
}

/**
 * Department coordinators are limited to their own department.
 * Returns a Prisma where-fragment for models that carry departmentId.
 */
export function departmentScope(session: Session): { departmentId?: string } {
  return session.role === "DEPARTMENT_COORDINATOR" ? { departmentId: session.departmentId ?? "none" } : {};
}

/** Rebuilds a session for a user id, e.g. to run an approved request as its requester. */
export async function sessionForUser(userId: string): Promise<Session> {
  const user = await db.user.findUnique({ where: { id: userId }, include: { college: { select: { isActive: true } } } });
  if (!user || !user.isActive || !user.college.isActive) throw forbidden("The requester's account is no longer active");
  return { userId: user.id, collegeId: user.collegeId, role: user.role, departmentId: user.departmentId, email: user.email, name: user.name };
}
