import { ApiError, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getDrive } from "@/lib/drives";
import type { Session } from "@/lib/auth/session";
import type { Prisma, RoundResultStatus } from "@/generated/prisma/client";

export type ResultInput = { applicationId: string; status: RoundResultStatus; score?: number; remarks?: string };
const fail = (m: string) => new ApiError(400, "RESULT_REJECTED", m);

/**
 * Records round results for shortlisted applicants, one transaction per row so a bad row never blocks the rest.
 * A cleared student moves to the next round automatically; a rejected student is rejected from the drive.
 * Results can be corrected until a later round has a result or an offer exists.
 */
export async function recordRoundResults(s: Session, driveId: string, roundId: string, inputs: ResultInput[]) {
  const drive = await getDrive(s.collegeId, driveId);
  if (drive.status !== "PUBLISHED") throw new ApiError(409, "CONFLICT", "Results can only be recorded while the drive is published");
  const rounds = await db.driveRound.findMany({ where: { driveId }, orderBy: { order: "asc" } });
  const round = rounds.find((r) => r.id === roundId);
  if (!round) throw notFound("Round not found");

  const seen = new Set<string>();
  const failed: { applicationId: string; reason: string }[] = [];
  let updated = 0;
  for (const input of inputs) {
    if (seen.has(input.applicationId)) { failed.push({ applicationId: input.applicationId, reason: "Listed more than once" }); continue; }
    seen.add(input.applicationId);
    try {
      await db.$transaction((tx) => applyOne(tx, s, driveId, rounds, round, input));
      updated++;
    } catch (e) {
      if (e instanceof ApiError) failed.push({ applicationId: input.applicationId, reason: e.message });
      else throw e;
    }
  }
  await audit(s, { action: "round.results", entity: "Drive", entityId: driveId, after: { roundId, updated, failed: failed.length } });
  return { updated, failed };
}

async function applyOne(tx: Prisma.TransactionClient, s: Session, driveId: string, rounds: { id: string; order: number }[], round: { id: string; order: number }, input: ResultInput) {
  const app = await tx.application.findFirst({
    where: { id: input.applicationId, driveId, collegeId: s.collegeId },
    include: { results: { select: { roundId: true, status: true } }, offers: { where: { status: { in: ["OFFERED", "ACCEPTED"] } }, select: { id: true } } },
  });
  if (!app) throw fail("Application not found in this drive");
  if (app.offers.length) throw fail("An offer exists for this student; revoke it before changing results");

  const orderOf = (id: string) => rounds.find((r) => r.id === id)?.order ?? 0;
  const existing = app.results.find((r) => r.roundId === round.id);
  const laterResults = app.results.some((r) => orderOf(r.roundId) > round.order);
  const correctingRejection = app.status === "REJECTED" && existing?.status === "REJECTED";
  if (app.status !== "SHORTLISTED" && !correctingRejection) throw fail("Only shortlisted applicants can be given round results");

  if (app.currentRound !== round.order) {
    if (!existing) throw fail(app.clearedAllRounds ? "Student has already completed all rounds" : `Student is waiting for round ${app.currentRound ?? "?"}, not this one`);
    if (laterResults) throw fail("A later round already has a result for this student");
  }
  if (input.score !== undefined && (input.score < 0 || input.score > 100000)) throw fail("Score is out of range");

  await tx.roundResult.upsert({
    where: { applicationId_roundId: { applicationId: app.id, roundId: round.id } },
    update: { status: input.status, score: input.score ?? null, remarks: input.remarks ?? null, recordedById: s.userId },
    create: { applicationId: app.id, roundId: round.id, status: input.status, score: input.score, remarks: input.remarks, recordedById: s.userId },
  });

  let status = app.status, currentRound = app.currentRound, cleared = app.clearedAllRounds;
  if (input.status === "CLEARED") {
    const next = rounds[rounds.findIndex((r) => r.id === round.id) + 1];
    status = "SHORTLISTED"; currentRound = next ? next.order : null; cleared = !next;
  } else if (input.status === "REJECTED") {
    status = "REJECTED"; currentRound = round.order; cleared = false;
  } else {
    status = "SHORTLISTED"; currentRound = round.order; cleared = false;
  }
  await tx.application.update({ where: { id: app.id }, data: { status, currentRound, clearedAllRounds: cleared, decidedById: s.userId } });
  await tx.applicationEvent.create({ data: { applicationId: app.id, status: status !== app.status ? status : null, roundId: round.id, roundResult: input.status, actorId: s.userId, note: input.remarks } });
}
