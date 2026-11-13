import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { hasMfaFactor } from "@/lib/auth/mfa";
import { getPolicy } from "@/lib/platformPolicy";
import { DEFAULT_REQUIRED_SECTIONS } from "@/lib/verification";

const patch = z.object({ requireMfaForAdmins: z.boolean() });

export const GET = route({ roles: ["TPO_ADMIN"] }, async (_req, s) => {
  const [row, admins, policy] = await Promise.all([
    db.collegeSettings.findUnique({ where: { collegeId: s.collegeId }, select: { requireMfaForAdmins: true } }),
    db.user.findMany({ where: { collegeId: s.collegeId, isActive: true, OR: [{ role: "TPO_ADMIN" }, { extraRoles: { has: "TPO_ADMIN" } }] }, select: { id: true, name: true, email: true } }),
    getPolicy(),
  ]);
  const enrolled = await Promise.all(admins.map(async (a) => ({ ...a, mfa: await hasMfaFactor(a.id) })));
  // `platformRequired`: the platform's minimum is on, so two-step sign-in is required for every administrator whatever this college chooses.
  return { requireMfaForAdmins: row?.requireMfaForAdmins ?? false, platformRequired: policy.requireAdminMfa, effective: policy.requireAdminMfa || (row?.requireMfaForAdmins ?? false), admins: enrolled };
});

/**
 * Turning the requirement on is refused until the person turning it on has their own authenticator app, so they cannot lock themselves out.
 * A college can be stricter than the platform but never weaker: while the platform minimum is on, turning the college's own setting off is refused (409).
 */
export const PATCH = route({ roles: ["TPO_ADMIN"] }, async (req, s) => {
  const { requireMfaForAdmins } = await parseBody(req, patch);
  if (requireMfaForAdmins && !(await hasMfaFactor(s.userId))) throw new ApiError(409, "MFA_NOT_SET_UP", "Set up your own authenticator app first, then turn this on");
  if (!requireMfaForAdmins && (await getPolicy(true)).requireAdminMfa) throw new ApiError(409, "PLATFORM_POLICY", "The platform requires two-step sign-in for every administrator. A college can be stricter than the platform, not weaker.");
  await db.$transaction(async (tx) => {
    await tx.collegeSettings.upsert({ where: { collegeId: s.collegeId }, update: { requireMfaForAdmins }, create: { collegeId: s.collegeId, requireMfaForAdmins, approvalRequired: [], requiredSections: DEFAULT_REQUIRED_SECTIONS } });
    await audit(s, { action: "settings.security.update", entity: "CollegeSettings", entityId: s.collegeId, after: { requireMfaForAdmins } }, tx);
  });
  return { requireMfaForAdmins };
});
