import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { EDITABLE } from "@/lib/invitations/onboarding";

/** A student may change their onboarding data only before submitting, or after corrections were requested. */
export async function assertEditable(studentId: string) {
  const st = await db.student.findUniqueOrThrow({ where: { id: studentId }, select: { onboardingStatus: true } });
  if (!EDITABLE.includes(st.onboardingStatus)) throw new ApiError(409, "LOCKED", "Your profile has been submitted and cannot be edited right now");
}

/**
 * Qualifications may be changed during onboarding (as `assertEditable`), and also once the profile is verified, when the change is kept as a
 * pending revision for staff to approve. Not while staff are reviewing the education section.
 */
export async function assertEducationEditable(studentId: string) {
  const st = await db.student.findUniqueOrThrow({ where: { id: studentId }, select: { onboardingStatus: true } });
  if (EDITABLE.includes(st.onboardingStatus)) return;
  if (st.onboardingStatus === "VERIFIED") {
    const sec = await db.studentSection.findUnique({ where: { studentId_section: { studentId, section: "EDUCATION_HISTORY" } }, select: { status: true } });
    if (sec?.status !== "SUBMITTED") return;
  }
  throw new ApiError(409, "LOCKED", "Your profile has been submitted and cannot be edited right now");
}

/** A document may be replaced while the profile is editable, and also after it is verified: the new file then goes back to staff and the profile reopens for review. */
export async function assertDocumentReplaceable(studentId: string) {
  const st = await db.student.findUniqueOrThrow({ where: { id: studentId }, select: { onboardingStatus: true } });
  if (EDITABLE.includes(st.onboardingStatus) || st.onboardingStatus === "VERIFIED") return;
  throw new ApiError(409, "LOCKED", "Your profile is being reviewed and its documents cannot be changed right now");
}
