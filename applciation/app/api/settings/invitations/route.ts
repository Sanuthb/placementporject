import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ProfileSection } from "@/generated/prisma/client";
import { DEFAULT_DECLARATION } from "@/lib/invitations/wizard";

const patch = z.object({ inviteExpiryDays: z.number().int().min(1).max(60).optional(), dataDeclaration: z.string().trim().max(2000).nullable().optional() });

export const GET = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] }, async (_req, s) => {
  const row = await db.collegeSettings.findUnique({ where: { collegeId: s.collegeId }, select: { inviteExpiryDays: true, dataDeclaration: true } });
  return { inviteExpiryDays: row?.inviteExpiryDays ?? 7, dataDeclaration: row?.dataDeclaration ?? null, defaultDeclaration: DEFAULT_DECLARATION };
});

/** How long an invitation stays valid, and the declaration a student accepts when submitting. */
export const PATCH = route({ roles: ["TPO_ADMIN"] }, async (req, s) => {
  const data = await parseBody(req, patch);
  const row = await db.$transaction(async (tx) => {
    const r = await tx.collegeSettings.upsert({
      where: { collegeId: s.collegeId }, update: data,
      create: { collegeId: s.collegeId, ...data, approvalRequired: [], requiredSections: Object.values(ProfileSection) },
      select: { inviteExpiryDays: true, dataDeclaration: true },
    });
    await audit(s, { action: "settings.invitations.update", entity: "CollegeSettings", entityId: s.collegeId, after: data }, tx);
    return r;
  });
  return { ...row, defaultDeclaration: DEFAULT_DECLARATION };
});
