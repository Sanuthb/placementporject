import { route } from "@/lib/api/handler";
import { scopedStudent } from "@/lib/verification";
import { db } from "@/lib/db";
import { gatherEvidence } from "@/lib/intelligence/evidence";
import { coverage, recommend } from "@/lib/careerRecommendations";

/**
 * A student's career profile for staff. Private results (personality, interests, behavioural style) appear only when the student has chosen to
 * share them, exactly as in the 360° intelligence view; recommendations are worked out from what staff can see.
 */
export const GET = route<{ id: string }>({ module: "ONBOARDING" }, async (_req, s, { id }) => {
  await scopedStudent(s, id);
  const e = await gatherEvidence(s.collegeId, id);
  // Private results were read for this view, so it is logged like any other staff access (the student can see this log).
  if (e.personalityShared && e.dimensions.some((d) => ["personality", "disc", "riasec"].includes(d.key) && d.items.length > 0)) {
    await db.psychAccessLog.create({ data: { collegeId: s.collegeId, actorId: s.userId, studentId: id, reason: "Student career profile view" } });
  }
  return { dimensions: e.dimensions, recommendations: recommend(e.dimensions, e.signals, "staff"), coverage: coverage(e.dimensions), personalityShared: e.personalityShared };
});
