import { studentRoute } from "@/lib/api/studentHandler";
import { ApiError } from "@/lib/api/errors";
import { ProfileSection } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyStaff } from "@/lib/notify";
import { buildSections, EDITABLE } from "@/lib/invitations/onboarding";
import { loadWizard } from "@/lib/invitations/wizard";
import { saveSection } from "@/lib/verification";

/**
 * Submit for verification. Everything the student entered is copied into the profile sections that staff review, and the
 * status becomes SUBMITTED. Submitting never verifies anything.
 */
export const POST = studentRoute({ module: "ONBOARDING", limit: { name: "onboarding-submit", max: 30, windowSec: 3600 } }, async (_req, me) => {
  const w = await loadWizard(me.studentId, me.collegeId);
  if (!w.editable) throw new ApiError(409, "LOCKED", "Your profile has already been submitted");
  if (w.missing.length) throw new ApiError(400, "INCOMPLETE", "Some required information is missing", w.missing);

  const sections = buildSections({ personal: w.personal, academics: w.academics, career: w.career, education: w.education, documents: w.documents });
  const p = w.personal;

  await db.$transaction(async (tx) => {
    const claim = await tx.student.updateMany({ where: { id: me.studentId, onboardingStatus: { in: EDITABLE } }, data: { onboardingStatus: "SUBMITTED", lastActivityAt: new Date() } });
    if (claim.count === 0) throw new ApiError(409, "LOCKED", "Your profile has already been submitted");

    // Contact details are the student's own to provide. The name is not: a different name waits for staff to decide.
    await tx.student.update({
      where: { id: me.studentId },
      data: { phone: p.mobile ?? null, dateOfBirth: p.dob ? new Date(p.dob) : null, gender: p.gender ?? null, address: [p.address, p.city, p.state, p.pincode].filter(Boolean).join(", ") },
    });
    await tx.studentOnboardingProfile.update({ where: { studentId: me.studentId }, data: { submittedAt: new Date(), reviewNote: null } });

    for (const section of Object.values(ProfileSection)) {
      const data = sections[section];
      if (!data) continue;
      const row = await tx.studentSection.findUnique({ where: { studentId_section: { studentId: me.studentId, section } } });
      if (row?.status === "SUBMITTED") continue; // already waiting for review, untouched
      if (row?.status === "VERIFIED" && JSON.stringify(row.data) === JSON.stringify(data)) continue; // verified and unchanged
      await saveSection(tx, { collegeId: me.collegeId, actorId: null }, me.studentId, section, data, true, true);
    }

    await notifyStaff(me.collegeId, { type: "onboarding.submitted", title: `${me.name} submitted their profile for verification`, link: `/staff/students/${me.studentId}`, departmentId: me.departmentId }, tx);
    await audit({ collegeId: me.collegeId, userId: null }, { action: "student.onboarding.submit", entity: "Student", entityId: me.studentId, after: { nameDiffers: !!w.nameReview } }, tx);
  });
  return { status: "SUBMITTED" };
});
