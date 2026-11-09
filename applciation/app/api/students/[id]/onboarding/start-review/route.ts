import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { scopedStudent } from "@/lib/verification";

/** Called when a verifier opens a submitted profile. Moves SUBMITTED to VERIFICATION_IN_PROGRESS; any other status is left alone. */
export const POST = route<{ id: string }>({ module: "ONBOARDING" }, async (_req, s, { id }) => {
  await scopedStudent(s, id);
  const r = await db.student.updateMany({ where: { id, collegeId: s.collegeId, onboardingStatus: "SUBMITTED" }, data: { onboardingStatus: "VERIFICATION_IN_PROGRESS" } });
  if (r.count) await audit(s, { action: "student.verification.start", entity: "Student", entityId: id });
  return { started: r.count > 0 };
});
