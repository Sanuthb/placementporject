import { route } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "EVENTS" }, async (_req, s, { id }) => {
  return db.$transaction(async (tx) => {
    const claim = await tx.event.updateMany({ where: { id, collegeId: s.collegeId, status: "PUBLISHED" }, data: { status: "COMPLETED" } });
    if (claim.count === 0) throw new ApiError(409, "CONFLICT", "Only published events can be moved to completed");
    await audit(s, { action: "event.complete", entity: "Event", entityId: id }, tx);
    return { id, status: "COMPLETED" };
  });
});
