import type { NextRequest } from "next/server";
import type { ModuleKey, Role } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { forbidden, unauthorized } from "@/lib/api/errors";
import { verifyTokenInfo } from "@/lib/auth/verifyToken";
import { hasMfaFactor } from "@/lib/auth/mfa";
import { ApiError } from "@/lib/api/errors";

export type Session = {
  userId: string;
  collegeId: string;
  /** The main role. */
  role: Role;
  /** Every role this person holds, the main one first. Permissions are the union of them. */
  roles: Role[];
  departmentId: string | null;
  email: string;
  name: string;
};

/** Verifies the Supabase JWT and loads the app user. Rejects inactive users and colleges. */
export async function getSession(req: NextRequest, opts: { skipMfa?: boolean } = {}): Promise<Session> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw unauthorized();

  const info = await verifyTokenInfo(token);
  const userId = info.userId;

  const user = await db.user.findUnique({
    where: { id: userId },
    include: { college: { select: { isActive: true } } },
  });
  if (!user || !user.isActive || !user.college.isActive) throw forbidden("Account is not active");

  const roles = [user.role, ...user.extraRoles.filter((r) => r !== user.role)];
  const session: Session = {
    userId: user.id,
    collegeId: user.collegeId,
    role: user.role,
    roles,
    departmentId: user.departmentId,
    email: user.email,
    name: user.name,
  };
  if (!opts.skipMfa) await enforceMfa(session, info.aal);
  return session;
}

/**
 * Administrators have two-step sign-in. Once one has an authenticator app set up, a session that has not entered the code is refused.
 * If the college requires it, an administrator with no authenticator app is refused too until they set one up. `/api/me` is exempt so the
 * screens can find out why and send the person to the right page.
 */
async function enforceMfa(session: Session, aal: string) {
  if (!session.roles.includes("TPO_ADMIN")) return;
  const enrolled = await hasMfaFactor(session.userId);
  if (enrolled && aal !== "aal2") throw new ApiError(403, "MFA_REQUIRED", "Confirm your sign-in with the code from your authenticator app");
  if (!enrolled) {
    const s = await db.collegeSettings.findUnique({ where: { collegeId: session.collegeId }, select: { requireMfaForAdmins: true } });
    if (s?.requireMfaForAdmins) throw new ApiError(403, "MFA_SETUP_REQUIRED", "Your college requires administrators to set up two-step sign-in");
  }
}

export const hasRole = (s: { roles: Role[] }, ...roles: Role[]) => roles.some((r) => s.roles.includes(r));
/** A coordinator who is also an officer or admin is not limited to one department; only a pure coordinator is. */
export const isCoordinatorOnly = (s: { roles: Role[] }) => s.roles.includes("DEPARTMENT_COORDINATOR") && !hasRole(s, "TPO_ADMIN", "PLACEMENT_OFFICER");

export function requireRole(session: Session, ...roles: Role[]) {
  if (!hasRole(session, ...roles)) throw forbidden();
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
  return isCoordinatorOnly(session) ? { departmentId: session.departmentId ?? "none" } : {};
}

/** Rebuilds a session for a user id, e.g. to run an approved request as its requester. */
export async function sessionForUser(userId: string): Promise<Session> {
  const user = await db.user.findUnique({ where: { id: userId }, include: { college: { select: { isActive: true } } } });
  if (!user || !user.isActive || !user.college.isActive) throw forbidden("The requester's account is no longer active");
  return { userId: user.id, collegeId: user.collegeId, role: user.role, roles: [user.role, ...user.extraRoles.filter((r) => r !== user.role)], departmentId: user.departmentId, email: user.email, name: user.name };
}
