import { route } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getDrive } from "@/lib/drives";

export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (_req, s, { id }) => {
  await getDrive(s.collegeId, id);
  return db.$transaction(async (tx) => {
    const claim = await tx.drive.updateMany({ where: { id, collegeId: s.collegeId, status: "PUBLISHED" }, data: { status: "CLOSED", closedAt: new Date() } });
    if (claim.count === 0) throw new ApiError(409, "CONFLICT", "Only published drives can be closed");
    await audit(s, { action: "drive.close", entity: "Drive", entityId: id }, tx);
    return { id, status: "CLOSED" };
  });
});
