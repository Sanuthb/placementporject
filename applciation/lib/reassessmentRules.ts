import { db } from "@/lib/db";
import { ruleFor, type Rule } from "@/lib/reassessment";

/** The college's rule for one category, or the default (the behaviour before rules existed). */
export async function ruleOf(collegeId: string, category: string): Promise<Rule> {
  return ruleFor(await db.reassessmentRule.findMany({ where: { collegeId }, select: { category: true, maxAttempts: true, cooldownDays: true } }), category);
}
