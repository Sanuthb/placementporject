import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getDrive } from "@/lib/drives";

/** Copies rules and rounds into a new draft. Dates must be revisited before it can be published. */
export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (_req, s, { id }) => {
  const src = await getDrive(s.collegeId, id);
  const rounds = await db.driveRound.findMany({ where: { driveId: id }, orderBy: { order: "asc" } });
  return db.$transaction(async (tx) => {
    const d = await tx.drive.create({
      data: {
        collegeId: s.collegeId, companyId: src.companyId, role: src.role, jobType: src.jobType, location: src.location, packageMinLpa: src.packageMinLpa, packageMaxLpa: src.packageMaxLpa,
        venue: src.venue, description: src.description, applicationDeadline: src.applicationDeadline, driveDate: src.driveDate,
        minCgpa: src.minCgpa, minTenthPct: src.minTenthPct, minTwelfthPct: src.minTwelfthPct, maxActiveBacklogs: src.maxActiveBacklogs,
        departmentIds: src.departmentIds, batchIds: src.batchIds, programIds: src.programIds, allowPlaced: src.allowPlaced, createdById: s.userId,
        rounds: { create: rounds.map((r) => ({ order: r.order, type: r.type, name: r.name, venue: r.venue })) },
      },
    });
    await audit(s, { action: "drive.duplicate", entity: "Drive", entityId: d.id, after: { copiedFrom: id } }, tx);
    return d;
  });
});
