import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { academicsDraft, careerDraft, EDITABLE, personalDraft } from "@/lib/invitations/onboarding";
import { loadWizard } from "@/lib/invitations/wizard";

export const GET = studentRoute({ module: "ONBOARDING" }, (_req, me) => loadWizard(me.studentId, me.collegeId));

const put = z.object({
  currentStep: z.number().int().min(1).max(6).optional(),
  personal: personalDraft.optional(),
  academics: academicsDraft.optional(),
  career: careerDraft.optional(),
  acceptDeclaration: z.boolean().optional(),
});

/** Saves a draft. Any step can be saved on its own and the wizard picks up where the student left off. Nothing here is submitted. */
export const PUT = studentRoute({ module: "ONBOARDING", limit: { name: "onboarding-save", max: 600, windowSec: 3600 } }, async (req, me) => {
  const b = await parseBody(req, put);
  await db.$transaction(async (tx) => {
    const st = await tx.student.findUniqueOrThrow({ where: { id: me.studentId }, select: { name: true, onboardingStatus: true } });
    if (!EDITABLE.includes(st.onboardingStatus)) throw new ApiError(409, "LOCKED", "Your profile has been submitted and cannot be edited right now");
    const prev = await tx.studentOnboardingProfile.upsert({ where: { studentId: me.studentId }, update: {}, create: { collegeId: me.collegeId, studentId: me.studentId } });
    // A different name is never written over the institution's record: it is kept aside for staff to decide.
    const entered = b.personal?.fullName?.trim();
    const proposedName = entered === undefined ? undefined : entered && entered !== st.name ? entered : null;
    await tx.studentOnboardingProfile.update({
      where: { studentId: me.studentId },
      data: {
        ...(b.currentStep ? { currentStep: b.currentStep } : {}),
        ...(b.personal ? { personal: b.personal } : {}),
        ...(b.academics ? { academics: b.academics } : {}),
        ...(b.career ? { career: b.career } : {}),
        ...(proposedName !== undefined ? { proposedName, ...(proposedName !== prev.proposedName ? { nameDecidedAt: null } : {}) } : {}),
        ...(b.acceptDeclaration !== undefined ? { declarationAcceptedAt: b.acceptDeclaration ? new Date() : null } : {}),
      },
    });
    await tx.student.update({ where: { id: me.studentId }, data: { lastActivityAt: new Date(), ...(st.onboardingStatus === "INVITATION_ACCEPTED" ? { onboardingStatus: "PROFILE_IN_PROGRESS" } : {}) } });
    await audit({ collegeId: me.collegeId, userId: null }, { action: "student.onboarding.save", entity: "Student", entityId: me.studentId, after: { steps: Object.keys(b).filter((k) => k !== "currentStep") } }, tx);
  });
  return loadWizard(me.studentId, me.collegeId);
});
