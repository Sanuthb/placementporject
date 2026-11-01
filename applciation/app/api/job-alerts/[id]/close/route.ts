import { route } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (_req, s, { id }) => {
  const claim = await db.jobAlert.updateMany({ where: { id, collegeId: s.collegeId, status: "PUBLISHED" }, data: { status: "CLOSED" } });
  if (claim.count === 0) throw new ApiError(409, "CONFLICT", "Only published alerts can be closed");
  await audit(s, { action: "jobAlert.close", entity: "JobAlert", entityId: id });
  return { id, status: "CLOSED" };
});
