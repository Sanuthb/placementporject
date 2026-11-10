import { studentRoute } from "@/lib/api/studentHandler";
import { db } from "@/lib/db";
import { statusesFor } from "@/lib/placementStatusService";

/** My applications with the round-by-round journey, any interview slot, and my placement status step by step (staff names are shown as "Placement office"). */
export const GET = studentRoute({ module: "DRIVES" }, async (_req, me) => {
  const settings = await db.collegeSettings.findUnique({ where: { collegeId: me.collegeId }, select: { shareRoundScores: true } });
  const share = settings?.shareRoundScores ?? false;
  const apps = await db.application.findMany({
    where: { studentId: me.studentId },
    select: {
      id: true, status: true, appliedAt: true, currentRound: true, clearedAllRounds: true,
      drive: { select: { id: true, role: true, driveDate: true, status: true, company: { select: { id: true, name: true, tier: true } }, rounds: { select: { id: true, order: true, type: true, scheduledAt: true, venue: true }, orderBy: { order: "asc" } } } },
      results: { select: { roundId: true, status: true, score: true, remarks: true, updatedAt: true } },
      slots: { where: { status: { in: ["SCHEDULED", "IN_PROGRESS"] } }, select: { roundId: true, startsAt: true, endsAt: true, status: true, panel: { select: { name: true, room: true } } } },
      offers: { select: { id: true, status: true } },
    },
    orderBy: { appliedAt: "desc" },
  });
  const status = new Map((await statusesFor({ collegeId: me.collegeId, studentId: me.studentId }, "student")).map((x) => [x.applicationId, x.status]));
  return apps.map(({ drive, results, slots, ...a }) => ({
    ...a, placement: status.get(a.id) ?? null, drive: { id: drive.id, role: drive.role, driveDate: drive.driveDate, status: drive.status, company: drive.company },
    journey: drive.rounds.map((r) => ({ round: r.order, type: r.type, scheduledAt: r.scheduledAt, venue: r.venue, result: results.find((x) => x.roundId === r.id)?.status ?? null, at: results.find((x) => x.roundId === r.id)?.updatedAt ?? null, score: share ? (results.find((x) => x.roundId === r.id)?.score ?? null) : null, remarks: share ? (results.find((x) => x.roundId === r.id)?.remarks ?? null) : null, slot: slots.find((x) => x.roundId === r.id) ?? null })),
  }));
});
