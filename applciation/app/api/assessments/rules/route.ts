import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AssessmentCategory } from "@/generated/prisma/client";
import { ASSESSMENT_CATEGORIES, ruleFor } from "@/lib/reassessment";

/** The retake rule for every category: the college's own, or the default. `custom` says which. */
export const GET = route({ module: "ASSESSMENTS" }, async (_req, s) => {
  const stored = await db.reassessmentRule.findMany({ where: { collegeId: s.collegeId }, select: { category: true, maxAttempts: true, cooldownDays: true, updatedAt: true } });
  return ASSESSMENT_CATEGORIES.map(([category, label]) => ({ category, label, ...ruleFor(stored, category), custom: stored.some((r) => r.category === category) }));
});

const body = z.object({
  rules: z.array(z.object({
    category: z.enum(AssessmentCategory),
    maxAttempts: z.number().int().min(1, "At least one attempt").max(20, "At most 20 attempts").nullable(),
    cooldownDays: z.number().int().min(0).max(730, "At most two years between attempts"),
  })).min(1).max(20),
});

/** Set retake rules (TPO admin). Each change is audited with the rule it replaced. */
export const PUT = route({ roles: ["TPO_ADMIN"], module: "ASSESSMENTS" }, async (req, s) => {
  const { rules } = await parseBody(req, body);
  return db.$transaction(async (tx) => {
    const before = await tx.reassessmentRule.findMany({ where: { collegeId: s.collegeId } });
    for (const r of rules) {
      await tx.reassessmentRule.upsert({ where: { collegeId_category: { collegeId: s.collegeId, category: r.category } }, update: { maxAttempts: r.maxAttempts, cooldownDays: r.cooldownDays, updatedById: s.userId }, create: { collegeId: s.collegeId, ...r, updatedById: s.userId } });
    }
    await audit(s, { action: "assessment.rules.update", entity: "College", entityId: s.collegeId, before: before.map(({ category, maxAttempts, cooldownDays }) => ({ category, maxAttempts, cooldownDays })), after: rules }, tx);
    return { saved: rules.length };
  });
});
