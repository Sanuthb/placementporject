import { z } from "zod";
import { db } from "@/lib/db";
import { badRequest, notFound } from "@/lib/api/errors";
import { JobType, RoundType } from "@/generated/prisma/client";

export const roundInput = z.object({
  type: z.enum(RoundType),
  name: z.string().trim().max(100).optional(),
  scheduledAt: z.coerce.date().optional(),
  venue: z.string().trim().max(200).optional(),
});

const pct = z.number().min(0).max(100);
export const driveFields = {
  companyId: z.uuid(),
  role: z.string().trim().min(2).max(150),
  jobType: z.enum(JobType),
  location: z.string().trim().max(200).optional(),
  packageMinLpa: z.number().min(0).max(1000).optional(),
  packageMaxLpa: z.number().min(0).max(1000).optional(),
  venue: z.string().trim().max(200).optional(),
  description: z.string().trim().max(10_000).optional(),
  applicationDeadline: z.coerce.date(),
  driveDate: z.coerce.date(),
  minCgpa: z.number().min(0).max(10).optional(),
  minTenthPct: pct.optional(),
  minTwelfthPct: pct.optional(),
  maxActiveBacklogs: z.number().int().min(0).max(50).optional(),
  departmentIds: z.array(z.uuid()).max(100),
  batchIds: z.array(z.uuid()).max(100),
  programIds: z.array(z.uuid()).max(100),
  allowPlaced: z.boolean(),
};

// Defaults live only on the create schema. Zod 4 applies defaults inside .partial(), which would
// silently reset eligibility rules on every PATCH.
export const createDriveSchema = z.object(driveFields).extend({
  departmentIds: driveFields.departmentIds.default([]),
  batchIds: driveFields.batchIds.default([]),
  programIds: driveFields.programIds.default([]),
  allowPlaced: driveFields.allowPlaced.default(false),
  rounds: z.array(roundInput).max(10).default([]),
});
export const patchDriveSchema = z.object(driveFields).partial();

/** Cross-field checks shared by create and update. */
export function checkDriveShape(d: { packageMinLpa?: number | null; packageMaxLpa?: number | null; applicationDeadline: Date; driveDate: Date }) {
  if (d.packageMinLpa != null && d.packageMaxLpa != null && d.packageMinLpa > d.packageMaxLpa) throw badRequest("packageMinLpa cannot exceed packageMaxLpa");
  if (d.driveDate < d.applicationDeadline) throw badRequest("driveDate cannot be before the application deadline");
}

/** Every referenced department, batch, program and company must belong to the college. */
export async function assertDriveRefs(collegeId: string, d: { companyId?: string; departmentIds?: string[]; batchIds?: string[]; programIds?: string[] }) {
  const [c, dep, b, p] = await Promise.all([
    d.companyId ? db.company.count({ where: { id: d.companyId, collegeId, isActive: true } }) : 1,
    d.departmentIds?.length ? db.department.count({ where: { id: { in: d.departmentIds }, collegeId } }) : 0,
    d.batchIds?.length ? db.batch.count({ where: { id: { in: d.batchIds }, collegeId } }) : 0,
    d.programIds?.length ? db.program.count({ where: { id: { in: d.programIds }, collegeId } }) : 0,
  ]);
  if (!c) throw badRequest("Company not found or inactive");
  if (dep !== new Set(d.departmentIds ?? []).size) throw badRequest("Unknown department in eligibility rules");
  if (b !== new Set(d.batchIds ?? []).size) throw badRequest("Unknown batch in eligibility rules");
  if (p !== new Set(d.programIds ?? []).size) throw badRequest("Unknown program in eligibility rules");
}

export async function getDrive(collegeId: string, id: string) {
  const d = await db.drive.findFirst({ where: { id, collegeId } });
  if (!d) throw notFound("Drive not found");
  return d;
}
