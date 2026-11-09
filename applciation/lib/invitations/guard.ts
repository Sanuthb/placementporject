import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { EDITABLE } from "@/lib/invitations/onboarding";

/** A student may change their onboarding data only before submitting, or after corrections were requested. */
export async function assertEditable(studentId: string) {
  const st = await db.student.findUniqueOrThrow({ where: { id: studentId }, select: { onboardingStatus: true } });
  if (!EDITABLE.includes(st.onboardingStatus)) throw new ApiError(409, "LOCKED", "Your profile has been submitted and cannot be edited right now");
}
