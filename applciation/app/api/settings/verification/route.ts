import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ProfileSection } from "@/generated/prisma/client";
import { DEFAULT_REQUIRED_SECTIONS } from "@/lib/verification";

const patch = z.object({
  requiredSections: z.array(z.enum(ProfileSection)).min(1).optional(),
  requireAssessmentToOnboard: z.boolean().optional(),
  aiDocumentReading: z.boolean().optional(),
});

export const GET = route({}, async (_req, s) => {
  const row = await db.collegeSettings.findUnique({ where: { collegeId: s.collegeId } });
  return row ?? { collegeId: s.collegeId, requiredSections: DEFAULT_REQUIRED_SECTIONS, requireAssessmentToOnboard: false, aiDocumentReading: false };
});

export const PATCH = route({ roles: ["TPO_ADMIN"] }, async (req, s) => {
  const data = await parseBody(req, patch);
  const unique = data.requiredSections && [...new Set(data.requiredSections)];
  return db.$transaction(async (tx) => {
    const before = await tx.collegeSettings.findUnique({ where: { collegeId: s.collegeId } });
    const after = await tx.collegeSettings.upsert({
      where: { collegeId: s.collegeId },
      update: { ...data, requiredSections: unique },
      create: { collegeId: s.collegeId, ...data, requiredSections: unique ?? DEFAULT_REQUIRED_SECTIONS },
    });
    await audit(s, { action: "settings.verification.update", entity: "CollegeSettings", entityId: s.collegeId, before: before ?? {}, after: data }, tx);
    return after;
  });
});
