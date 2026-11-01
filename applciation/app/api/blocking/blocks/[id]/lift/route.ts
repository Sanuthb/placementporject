import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

const body = z.object({ reason: z.string().trim().min(5, "A reason is required to lift a block").max(500) });

/** Lifting is an override, so a reason is mandatory and the action is logged. */
export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ATTENDANCE_BLOCKING" }, async (req, s, { id }) => {
  const { reason } = await parseBody(req, body);
  return db.$transaction(async (tx) => {
    const claim = await tx.block.updateMany({ where: { id, collegeId: s.collegeId, status: "ACTIVE" }, data: { status: "LIFTED", liftReason: reason, liftedById: s.userId, liftedAt: new Date() } });
    if (claim.count === 0) throw new ApiError(409, "CONFLICT", "Only active blocks can be lifted");
    await audit(s, { action: "block.lift", entity: "Block", entityId: id, reason }, tx);
    return { id, status: "LIFTED" };
  });
});
