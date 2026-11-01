import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { CompanyTier, RelationshipStatus } from "@/generated/prisma/client";
import { contactSchema } from "@/lib/companies";

const patch = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  industry: z.string().trim().max(100).nullable().optional(),
  website: z.url().nullable().optional(),
  tier: z.enum(CompanyTier).optional(),
  relationshipStatus: z.enum(RelationshipStatus).optional(),
  contacts: z.array(contactSchema).max(20).optional(),
  isActive: z.boolean().optional(),
});

/** Company detail with drive history: years visited, packages, offers made. */
export const GET = route<{ id: string }>({ module: "DRIVES" }, async (_req, s, { id }) => {
  const c = await db.company.findFirst({ where: { id, collegeId: s.collegeId } });
  if (!c) throw notFound("Company not found");
  const drives = await db.drive.findMany({
    where: { companyId: id, collegeId: s.collegeId, status: { in: ["PUBLISHED", "CLOSED"] } },
    select: { id: true, role: true, jobType: true, driveDate: true, status: true, packageMinLpa: true, packageMaxLpa: true },
    orderBy: { driveDate: "desc" },
  });
  const years = [...new Set(drives.map((d) => d.driveDate.getUTCFullYear()))].sort((a, b) => b - a);
  const accepted = await db.offer.findMany({ where: { companyId: id, collegeId: s.collegeId, status: "ACCEPTED" }, select: { studentId: true, isPpo: true, packageLpa: true } });
  const packages = accepted.map((o) => Number(o.packageLpa));
  return {
    ...c,
    history: {
      years, driveCount: drives.length, drives,
      studentsHired: new Set(accepted.map((o) => o.studentId)).size,
      ppoConversions: accepted.filter((o) => o.isPpo).length,
      highestPackageLpa: packages.length ? Math.max(...packages) : null,
      averagePackageLpa: packages.length ? Math.round((packages.reduce((a, b) => a + b, 0) / packages.length) * 100) / 100 : null,
    },
  };
});

export const PATCH = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (req, s, { id }) => {
  const data = await parseBody(req, patch);
  return db.$transaction(async (tx) => {
    const before = await tx.company.findFirst({ where: { id, collegeId: s.collegeId } });
    if (!before) throw notFound("Company not found");
    const after = await tx.company.update({ where: { id }, data });
    await audit(s, { action: "company.update", entity: "Company", entityId: id, before: { name: before.name, tier: before.tier, relationshipStatus: before.relationshipStatus, isActive: before.isActive }, after: { ...data, contacts: undefined } }, tx);
    return after;
  });
});
