import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getDrive } from "@/lib/drives";
import type { Session } from "@/lib/auth/session";

export type DecideInput = { applicationIds: string[]; status: "SHORTLISTED" | "ON_HOLD" | "REJECTED"; note?: string };

/** Shortlist, hold or reject applicants. Withdrawn applications and those holding a live offer are left alone. */
export async function decideApplications(s: Session, driveId: string, input: DecideInput) {
  const { applicationIds, status, note } = input;
  const drive = await getDrive(s.collegeId, driveId);
  if (drive.status !== "PUBLISHED" && drive.status !== "CLOSED") throw new ApiError(409, "CONFLICT", "Only published or closed drives can be decided");
  const roundCount = await db.driveRound.count({ where: { driveId } });

  return db.$transaction(async (tx) => {
    const targets = await tx.application.findMany({
      where: { id: { in: applicationIds }, driveId, collegeId: s.collegeId, status: { not: "WITHDRAWN" } },
      select: { id: true, status: true, offers: { where: { status: { in: ["OFFERED", "ACCEPTED"] } }, select: { id: true } } },
    });
    const withOffer = targets.filter((t) => t.offers.length > 0);
    const changing = targets.filter((t) => t.status !== status && t.offers.length === 0);
    if (changing.length) {
      const ids = changing.map((t) => t.id);
      await tx.application.updateMany({ where: { id: { in: ids } }, data: { status, decidedById: s.userId } });
      if (status === "SHORTLISTED") {
        // Newly shortlisted students enter the first round (or are ready for offers if the drive has none).
        if (roundCount > 0) await tx.application.updateMany({ where: { id: { in: ids }, currentRound: null, clearedAllRounds: false }, data: { currentRound: 1 } });
        else await tx.application.updateMany({ where: { id: { in: ids }, clearedAllRounds: false }, data: { clearedAllRounds: true } });
      }
      await tx.applicationEvent.createMany({ data: ids.map((id) => ({ applicationId: id, status, actorId: s.userId, note })) });
    }
    await audit(s, { action: "application.decide", entity: "Drive", entityId: driveId, after: { status, changed: changing.length } }, tx);
    return { updated: changing.length, unchanged: targets.length - changing.length - withOffer.length, blockedByOffer: withOffer.length, notFound: applicationIds.length - targets.length };
  });
}
