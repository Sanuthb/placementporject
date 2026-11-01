import { route } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { getDrive } from "@/lib/drives";
import { sheetResponse } from "@/lib/xlsx";

/** Students who cleared this round, as a file to share with the company. */
export const GET = route<{ id: string; roundId: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (_req, s, { id, roundId }) => {
  await getDrive(s.collegeId, id);
  const round = await db.driveRound.findFirst({ where: { id: roundId, driveId: id } });
  if (!round) throw notFound("Round not found");
  const rows = await db.roundResult.findMany({ where: { roundId, status: "CLEARED" }, select: { score: true, application: { select: { student: { select: { enrollmentNo: true, name: true, email: true } } } } }, orderBy: { application: { student: { name: "asc" } } } });
  return sheetResponse(`shortlist-round-${round.order}.xlsx`, ["enrollment_no", "name", "email", "score"], rows.map((r) => [r.application.student.enrollmentNo, r.application.student.name, r.application.student.email, r.score === null ? null : Number(r.score)]));
});
