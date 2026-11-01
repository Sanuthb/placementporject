import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getDrive } from "@/lib/drives";

const body = z.object({ reason: z.string().trim().min(3).max(500) });

export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (req, s, { id }) => {
  const { reason } = await parseBody(req, body);
  await getDrive(s.collegeId, id);
  return db.$transaction(async (tx) => {
    const claim = await tx.drive.updateMany({ where: { id, collegeId: s.collegeId, status: { in: ["DRAFT", "PUBLISHED"] } }, data: { status: "CANCELLED", cancelReason: reason } });
    if (claim.count === 0) throw new ApiError(409, "CONFLICT", "Only draft or published drives can be cancelled");
    await audit(s, { action: "drive.cancel", entity: "Drive", entityId: id, reason }, tx);
    return { id, status: "CANCELLED" };
  });
});
