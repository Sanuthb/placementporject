import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApprovalAction, ProfileSection } from "@/generated/prisma/client";

const patch = z.object({
  maxOffersPerStudent: z.number().int().min(1).max(20).nullable().optional(),
  enforceTierUpgrade: z.boolean().optional(),
  shareRoundScores: z.boolean().optional(),
  approvalRequired: z.array(z.enum(ApprovalAction)).optional(),
});
const pick = (r: { maxOffersPerStudent: number | null; enforceTierUpgrade: boolean; shareRoundScores: boolean; approvalRequired: ApprovalAction[] }) => ({ maxOffersPerStudent: r.maxOffersPerStudent, enforceTierUpgrade: r.enforceTierUpgrade, shareRoundScores: r.shareRoundScores, approvalRequired: r.approvalRequired });

export const GET = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] }, async (_req, s) => {
  const row = await db.collegeSettings.findUnique({ where: { collegeId: s.collegeId } });
  return row ? pick(row) : { maxOffersPerStudent: 1, enforceTierUpgrade: false, shareRoundScores: false, approvalRequired: [] }; // defaults: one offer per student, approvals off
});

export const PATCH = route({ roles: ["TPO_ADMIN"] }, async (req, s) => {
  const data = await parseBody(req, patch);
  const approvalRequired = data.approvalRequired && [...new Set(data.approvalRequired)];
  return db.$transaction(async (tx) => {
    const before = await tx.collegeSettings.findUnique({ where: { collegeId: s.collegeId } });
    const after = await tx.collegeSettings.upsert({
      where: { collegeId: s.collegeId },
      update: { ...data, approvalRequired },
      create: { collegeId: s.collegeId, ...data, approvalRequired: approvalRequired ?? [], requiredSections: Object.values(ProfileSection) },
    });
    await audit(s, { action: "settings.policies.update", entity: "CollegeSettings", entityId: s.collegeId, before: before ? pick(before) : {}, after: data }, tx);
    return pick(after);
  });
});
