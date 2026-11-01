import { ApiError, badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { evaluateEligibility } from "@/lib/eligibility";
import { getDrive } from "@/lib/drives";
import type { Session } from "@/lib/auth/session";

export async function addException(s: Session, driveId: string, input: { studentId: string; reason: string }) {
  const drive = await getDrive(s.collegeId, driveId);
  if (drive.status === "CLOSED" || drive.status === "CANCELLED") throw new ApiError(409, "CONFLICT", "Exceptions cannot be added to a closed or cancelled drive");
  // evaluateEligibility only returns students who pass the hard criteria, so this also rejects opted-out, inactive and not-onboarded students.
  const [row] = await evaluateEligibility(drive, { studentId: input.studentId });
  if (!row) throw badRequest("This student cannot be added: they must be active, onboarded and registered for placement");
  if (row.blocked) throw badRequest("This student is currently blocked; lift the block instead of adding an exception");
  if (row.reasons.length === 0) throw badRequest("This student is already eligible");
  return db.$transaction(async (tx) => {
    const ex = await tx.driveException.upsert({
      where: { driveId_studentId: { driveId, studentId: input.studentId } },
      update: { reason: input.reason, createdById: s.userId },
      create: { driveId, studentId: input.studentId, reason: input.reason, createdById: s.userId },
    });
    await audit(s, { action: "drive.exception.add", entity: "Drive", entityId: driveId, after: { studentId: input.studentId, waived: row.reasons }, reason: input.reason }, tx);
    return { id: ex.id, studentId: input.studentId, waived: row.reasons };
  });
}
