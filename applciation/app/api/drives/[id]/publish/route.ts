import { route } from "@/lib/api/handler";
import { ApiError, badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getDrive } from "@/lib/drives";

export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (_req, s, { id }) => {
  const d = await getDrive(s.collegeId, id);
  if (d.status !== "DRAFT") throw new ApiError(409, "CONFLICT", "Only draft drives can be published");
  if (d.applicationDeadline <= new Date()) throw badRequest("The application deadline must be in the future");
  if (d.driveDate < d.applicationDeadline) throw badRequest("driveDate cannot be before the application deadline");
  if (!(await db.company.count({ where: { id: d.companyId, isActive: true } }))) throw badRequest("The company is inactive");
  return db.$transaction(async (tx) => {
    const claim = await tx.drive.updateMany({ where: { id, status: "DRAFT" }, data: { status: "PUBLISHED", publishedAt: new Date() } });
    if (claim.count === 0) throw new ApiError(409, "CONFLICT", "Only draft drives can be published");
    await audit(s, { action: "drive.publish", entity: "Drive", entityId: id }, tx);
    return { id, status: "PUBLISHED" };
  });
});
