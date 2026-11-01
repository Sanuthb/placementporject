import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getDrive, roundInput } from "@/lib/drives";

const body = z.object({ rounds: z.array(roundInput).max(10) });

/** Replaces the ordered round list. Array position becomes the round order. */
export const PUT = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (req, s, { id }) => {
  const { rounds } = await parseBody(req, body);
  const d = await getDrive(s.collegeId, id);
  if (d.status === "CLOSED" || d.status === "CANCELLED") throw new ApiError(409, "CONFLICT", "Rounds of a closed or cancelled drive cannot be changed");
  // Replacing rounds deletes their results, so it is refused once any result exists.
  if (await db.roundResult.count({ where: { round: { driveId: id } } })) throw new ApiError(409, "CONFLICT", "Rounds cannot be replaced after results have been recorded");
  return db.$transaction(async (tx) => {
    await tx.driveRound.deleteMany({ where: { driveId: id } });
    await tx.driveRound.createMany({ data: rounds.map((r, i) => ({ ...r, driveId: id, order: i + 1 })) });
    await audit(s, { action: "drive.rounds.replace", entity: "Drive", entityId: id, after: { rounds: rounds.length } }, tx);
    return tx.driveRound.findMany({ where: { driveId: id }, orderBy: { order: "asc" } });
  });
});
