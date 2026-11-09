import { studentRoute } from "@/lib/api/studentHandler";
import { gatherEvidence } from "@/lib/intelligence/evidence";
import { coverage, recommend } from "@/lib/careerRecommendations";

/**
 * My 360° career profile: academics, aptitude, personality, interests, behavioural style, technical, digital, communication, teamwork,
 * experience and preferences, with recommendations from my results. I always see my own private results here.
 */
export const GET = studentRoute({ module: "ONBOARDING" }, async (_req, me) => {
  const e = await gatherEvidence(me.collegeId, me.studentId, { asStudent: true });
  return { dimensions: e.dimensions, recommendations: recommend(e.dimensions, e.signals), coverage: coverage(e.dimensions), context: e.context, generatedAt: new Date() };
});
