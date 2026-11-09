import { route } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { scopedStudent } from "@/lib/verification";
import { modulesOf } from "@/lib/student360";

export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (_req, s, { id }) => {
  const st = await scopedStudent(s, id);
  if (st.stage === "ONBOARDED") throw new ApiError(409, "CONFLICT", "Student is already onboarded");
  if (st.stage !== "VERIFIED") throw new ApiError(409, "CONFLICT", "All required sections must be verified before onboarding");

  // If the college requires the assessment and has the Psychometrics module, the student must have completed it.
  const [settings, mods] = await Promise.all([db.collegeSettings.findUnique({ where: { collegeId: s.collegeId } }), modulesOf(s.collegeId)]);
  if (settings?.requireAssessmentToOnboard && mods.has("PSYCHOMETRICS") && !(await db.psychAttempt.findFirst({ where: { studentId: id, isCurrent: true }, select: { id: true } })))
    throw new ApiError(409, "ASSESSMENT_REQUIRED", "This student must complete the personality and aptitude assessment before onboarding");
  return db.$transaction(async (tx) => {
    const claim = await tx.student.updateMany({ where: { id, collegeId: s.collegeId, stage: "VERIFIED" }, data: { stage: "ONBOARDED", onboardedAt: new Date() } });
    if (claim.count === 0) throw new ApiError(409, "CONFLICT", "Student is no longer in the verified stage");
    await audit(s, { action: "student.onboard", entity: "Student", entityId: id }, tx);
    return { studentId: id, stage: "ONBOARDED" };
  });
});
