import { db } from "@/lib/db";
import { evaluateEligibility } from "@/lib/eligibility";
import type { Drive } from "@/generated/prisma/client";

/** Why a student can or cannot apply, including the hard reasons evaluateEligibility cannot report (not onboarded, opted out...). */
export async function eligibilityFor(drive: Drive, studentId: string) {
  const [row] = await evaluateEligibility(drive, { studentId });
  if (row) return { eligible: row.eligible, viaException: row.viaException, blocked: row.blocked, reasons: row.reasons };
  const st = await db.student.findUniqueOrThrow({ where: { id: studentId }, select: { stage: true, participationStatus: true } });
  const reasons: string[] = [];
  if (st.stage !== "ONBOARDED") reasons.push("Complete your profile and get it verified and onboarded before applying");
  if (st.participationStatus !== "REGISTERED") reasons.push("You are not registered for placement");
  return { eligible: false, viaException: false, blocked: false, reasons: reasons.length ? reasons : ["Not eligible"] };
}
