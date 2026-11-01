import { ApiError, badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import type { Session } from "@/lib/auth/session";
import { notifyStaff, notifyStudent } from "@/lib/notify";
import type { CompanyTier, Prisma } from "@/generated/prisma/client";

export const TIER_RANK: Record<CompanyTier, number> = { REGULAR: 1, CORE: 2, DREAM: 3, SUPER_DREAM: 4 };
const best = (tiers: CompanyTier[]) => tiers.reduce<CompanyTier | null>((a, t) => (a === null || TIER_RANK[t] > TIER_RANK[a] ? t : a), null);

export type OfferInput = { applicationId: string; packageLpa: number; role?: string; isPpo?: boolean; expiresAt?: Date | string };

/** Re-derives placed status and tier from the student's accepted offers. */
export async function recomputePlaced(tx: Prisma.TransactionClient, studentId: string) {
  const accepted = await tx.offer.findMany({ where: { studentId, status: "ACCEPTED" }, select: { company: { select: { tier: true } } } });
  await tx.student.update({ where: { id: studentId }, data: { isPlaced: accepted.length > 0, placedTier: best(accepted.map((o) => o.company.tier)) } });
}

const lockStudent = (tx: Prisma.TransactionClient, id: string) => tx.$queryRaw`SELECT id FROM "Student" WHERE id = ${id}::uuid FOR UPDATE`;

export async function createOffer(s: Session, input: OfferInput) {
  const app = await db.application.findFirst({
    where: { id: input.applicationId, collegeId: s.collegeId },
    include: { drive: { include: { company: true, rounds: { select: { id: true } } } }, student: true },
  });
  if (!app) throw notFound("Application not found");
  const { drive, student } = app;
  if (drive.status !== "PUBLISHED" && drive.status !== "CLOSED") throw new ApiError(409, "CONFLICT", "Offers can only be made on published or closed drives");
  if (app.status !== "SHORTLISTED") throw badRequest("Only shortlisted applicants can receive an offer");
  if (drive.rounds.length > 0 && !app.clearedAllRounds) throw badRequest("The student has not cleared all rounds yet");
  if (!student.isActive || student.isArchived) throw badRequest("The student account is not active");
  if (input.isPpo && drive.jobType === "FULL_TIME") throw badRequest("A pre-placement offer must come from an internship drive");
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (expiresAt && expiresAt <= new Date()) throw badRequest("expiresAt must be in the future");

  return db.$transaction(async (tx) => {
    await lockStudent(tx, student.id); // serialises concurrent offers to the same student
    const [settings, live] = await Promise.all([
      tx.collegeSettings.findUnique({ where: { collegeId: s.collegeId } }),
      tx.offer.findMany({ where: { studentId: student.id, status: { in: ["OFFERED", "ACCEPTED"] } }, select: { applicationId: true, status: true, company: { select: { tier: true } } } }),
    ]);
    if (live.some((o) => o.applicationId === app.id)) throw new ApiError(409, "CONFLICT", "This application already has an active offer");

    const max = settings ? settings.maxOffersPerStudent : 1; // no settings row yet: default of one offer; null means unlimited
    const accepted = live.filter((o) => o.status === "ACCEPTED");
    if (settings?.enforceTierUpgrade && accepted.length > 0) {
      const top = best(accepted.map((o) => o.company.tier))!;
      if (TIER_RANK[drive.company.tier] <= TIER_RANK[top]) throw new ApiError(409, "OFFER_RULE", `The student is already placed at a ${top.toLowerCase().replace("_", " ")} company; only a higher tier can be offered`);
    } else if (max !== null && live.length >= max) {
      throw new ApiError(409, "OFFER_RULE", `The student already holds the maximum of ${max} offer${max === 1 ? "" : "s"}`);
    }

    const offer = await tx.offer.create({
      data: { collegeId: s.collegeId, applicationId: app.id, driveId: drive.id, studentId: student.id, companyId: drive.companyId, role: input.role ?? drive.role, packageLpa: input.packageLpa, isPpo: input.isPpo ?? false, expiresAt, createdById: s.userId },
    });
    await tx.applicationEvent.create({ data: { applicationId: app.id, actorId: s.userId, note: `Offer made: ${offer.role}, ${input.packageLpa} LPA` } });
    await audit(s, { action: "offer.create", entity: "Offer", entityId: offer.id, after: { studentId: student.id, driveId: drive.id, packageLpa: input.packageLpa } }, tx);
    await notifyStudent(s.collegeId, student.id, { type: "offer.received", title: `You have an offer from ${drive.company.name}`, body: `${offer.role}, ${input.packageLpa} LPA`, link: `/offers/${offer.id}` }, tx);
    return offer;
  });
}

export async function respondToOffer(s: { collegeId: string; userId: string | null }, offerId: string, decision: "ACCEPT" | "DECLINE") {
  const found = await db.offer.findFirst({ where: { id: offerId, collegeId: s.collegeId }, select: { studentId: true } });
  if (!found) throw notFound("Offer not found");
  return db.$transaction(async (tx) => {
    await lockStudent(tx, found.studentId);
    const offer = await tx.offer.findUniqueOrThrow({ where: { id: offerId } });
    if (offer.status !== "OFFERED") throw new ApiError(409, "CONFLICT", `This offer is already ${offer.status.toLowerCase()}`);
    if (offer.expiresAt && offer.expiresAt <= new Date()) throw new ApiError(409, "OFFER_EXPIRED", "This offer has expired");
    const status = decision === "ACCEPT" ? "ACCEPTED" : "DECLINED";
    await tx.offer.update({ where: { id: offerId }, data: { status, respondedAt: new Date() } });
    if (status === "ACCEPTED") await recomputePlaced(tx, offer.studentId); // placed status updates automatically
    if (offer.applicationId) await tx.applicationEvent.create({ data: { applicationId: offer.applicationId, actorId: s.userId, note: `Offer ${status.toLowerCase()}` } });
    await audit(s, { action: `offer.${status.toLowerCase()}`, entity: "Offer", entityId: offerId }, tx);
    const who = await tx.student.findUniqueOrThrow({ where: { id: offer.studentId }, select: { name: true, departmentId: true } });
    await notifyStaff(s.collegeId, { type: "offer.response", title: `${who.name} ${status === "ACCEPTED" ? "accepted" : "declined"} an offer`, link: `/offers/${offerId}`, departmentId: who.departmentId, excludeUserId: s.userId }, tx);
    return { id: offerId, status };
  });
}

export async function revokeOffer(s: Session, offerId: string, reason: string) {
  const found = await db.offer.findFirst({ where: { id: offerId, collegeId: s.collegeId }, select: { studentId: true } });
  if (!found) throw notFound("Offer not found");
  return db.$transaction(async (tx) => {
    await lockStudent(tx, found.studentId);
    const claim = await tx.offer.updateMany({ where: { id: offerId, status: { in: ["OFFERED", "ACCEPTED"] } }, data: { status: "REVOKED", revokeReason: reason, respondedAt: new Date(), joiningStatus: "PENDING", joiningDate: null } });
    if (claim.count === 0) throw new ApiError(409, "CONFLICT", "Only offered or accepted offers can be revoked");
    await recomputePlaced(tx, found.studentId);
    await audit(s, { action: "offer.revoke", entity: "Offer", entityId: offerId, reason }, tx);
    return { id: offerId, status: "REVOKED" };
  });
}
