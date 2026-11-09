import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;
const REVIEW_STATES = ["SUBMITTED", "VERIFICATION_IN_PROGRESS", "CHANGES_REQUESTED", "VERIFIED"];

/**
 * Keeps the student's overall onboarding status in step with section and document review. A profile is VERIFIED only when every required
 * section is verified (that is the staff approval) and no document is still waiting or rejected. Document status itself is never changed here.
 */
export async function syncOnboardingStatus(tx: Tx, studentId: string) {
  const st = await tx.student.findUniqueOrThrow({ where: { id: studentId }, select: { onboardingStatus: true, stage: true } });
  if (!REVIEW_STATES.includes(st.onboardingStatus)) return;
  const [openDocs, submitted] = await Promise.all([
    tx.studentDocument.count({ where: { studentId, status: { in: ["PENDING", "REJECTED"] }, archivedAt: null } }),
    tx.studentSection.count({ where: { studentId, status: "SUBMITTED" } }),
  ]);
  const fullyApproved = (st.stage === "VERIFIED" || st.stage === "ONBOARDED") && openDocs === 0;
  let next = st.onboardingStatus;
  if (fullyApproved) next = "VERIFIED";
  else if (st.onboardingStatus === "VERIFIED") next = submitted || openDocs ? "VERIFICATION_IN_PROGRESS" : "PROFILE_IN_PROGRESS";
  if (next !== st.onboardingStatus) await tx.student.update({ where: { id: studentId }, data: { onboardingStatus: next } });
}
