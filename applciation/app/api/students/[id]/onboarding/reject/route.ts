import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { scopedStudent } from "@/lib/verification";
import { tellStudent } from "@/lib/invitations/notify";

const body = z.object({ reason: z.string().trim().min(5).max(1000) });

/** Rejects the profile. The student cannot edit it until staff reopen it by requesting corrections. */
export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (req, s, { id }) => {
  await scopedStudent(s, id);
  const { reason } = await parseBody(req, body);
  await db.$transaction(async (tx) => {
    const claim = await tx.student.updateMany({ where: { id, collegeId: s.collegeId, onboardingStatus: { in: ["SUBMITTED", "VERIFICATION_IN_PROGRESS"] } }, data: { onboardingStatus: "REJECTED" } });
    if (claim.count === 0) throw new ApiError(409, "CONFLICT", "Only a submitted profile can be rejected");
    await tx.studentOnboardingProfile.update({ where: { studentId: id }, data: { reviewNote: reason } });
    await audit(s, { action: "student.verification.reject", entity: "Student", entityId: id, reason }, tx);
  });
  await tellStudent(s.collegeId, id, { type: "onboarding.rejected", title: "Your profile was not accepted", body: reason });
  return { status: "REJECTED" };
});
