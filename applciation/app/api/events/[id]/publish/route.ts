import { route } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "EVENTS" }, async (_req, s, { id }) => {
  return db.$transaction(async (tx) => {
    const claim = await tx.event.updateMany({ where: { id, collegeId: s.collegeId, status: "DRAFT" }, data: { status: "PUBLISHED" } });
    if (claim.count === 0) throw new ApiError(409, "CONFLICT", "Only draft events can be moved to published");
    await audit(s, { action: "event.publish", entity: "Event", entityId: id }, tx);
    return { id, status: "PUBLISHED" };
  });
});
