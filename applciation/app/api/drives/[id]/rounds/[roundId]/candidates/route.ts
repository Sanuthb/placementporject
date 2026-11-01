import { route } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { getDrive } from "@/lib/drives";

/** Applicants waiting for this round, plus those who already have a result for it. */
export const GET = route<{ id: string; roundId: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (_req, s, { id, roundId }) => {
  await getDrive(s.collegeId, id);
  const round = await db.driveRound.findFirst({ where: { id: roundId, driveId: id } });
  if (!round) throw notFound("Round not found");
  const apps = await db.application.findMany({
    where: { driveId: id, collegeId: s.collegeId, OR: [{ currentRound: round.order, status: "SHORTLISTED" }, { results: { some: { roundId } } }] },
    select: { id: true, status: true, student: { select: { id: true, name: true, enrollmentNo: true } }, results: { where: { roundId }, select: { status: true, score: true, remarks: true } } },
    orderBy: { student: { name: "asc" } },
  });
  return { round: { id: round.id, order: round.order, type: round.type }, items: apps.map(({ results, ...a }) => ({ ...a, result: results[0] ?? null })) };
});
