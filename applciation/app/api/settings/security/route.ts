import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { hasMfaFactor } from "@/lib/auth/mfa";
import { ProfileSection } from "@/generated/prisma/client";

const patch = z.object({ requireMfaForAdmins: z.boolean() });

export const GET = route({ roles: ["TPO_ADMIN"] }, async (_req, s) => {
  const [row, admins] = await Promise.all([
    db.collegeSettings.findUnique({ where: { collegeId: s.collegeId }, select: { requireMfaForAdmins: true } }),
    db.user.findMany({ where: { collegeId: s.collegeId, isActive: true, OR: [{ role: "TPO_ADMIN" }, { extraRoles: { has: "TPO_ADMIN" } }] }, select: { id: true, name: true, email: true } }),
  ]);
  const enrolled = await Promise.all(admins.map(async (a) => ({ ...a, mfa: await hasMfaFactor(a.id) })));
  return { requireMfaForAdmins: row?.requireMfaForAdmins ?? false, admins: enrolled };
});

/** Turning the requirement on is refused until the person turning it on has their own authenticator app, so they cannot lock themselves out. */
export const PATCH = route({ roles: ["TPO_ADMIN"] }, async (req, s) => {
  const { requireMfaForAdmins } = await parseBody(req, patch);
  if (requireMfaForAdmins && !(await hasMfaFactor(s.userId))) throw new ApiError(409, "MFA_NOT_SET_UP", "Set up your own authenticator app first, then turn this on");
  await db.$transaction(async (tx) => {
    await tx.collegeSettings.upsert({ where: { collegeId: s.collegeId }, update: { requireMfaForAdmins }, create: { collegeId: s.collegeId, requireMfaForAdmins, approvalRequired: [], requiredSections: Object.values(ProfileSection) } });
    await audit(s, { action: "settings.security.update", entity: "CollegeSettings", entityId: s.collegeId, after: { requireMfaForAdmins } }, tx);
  });
  return { requireMfaForAdmins };
});
