import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody, parseQuery } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertDriveRefs, checkDriveShape, createDriveSchema } from "@/lib/drives";
import { DriveStatus } from "@/generated/prisma/client";

const query = z.object({
  status: z.enum(DriveStatus).optional(),
  companyId: z.uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.uuid().optional(),
});

export const GET = route({ module: "DRIVES" }, async (req, s) => {
  const q = parseQuery(req, query);
  const rows = await db.drive.findMany({
    where: { collegeId: s.collegeId, status: q.status, companyId: q.companyId, driveDate: { gte: q.from, lte: q.to } },
    select: { id: true, role: true, jobType: true, status: true, driveDate: true, applicationDeadline: true, packageMinLpa: true, packageMaxLpa: true, company: { select: { id: true, name: true, tier: true } }, _count: { select: { applications: true } } },
    orderBy: [{ driveDate: "desc" }, { id: "asc" }],
    take: q.limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > q.limit;
  const items = hasMore ? rows.slice(0, q.limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
});

export const POST = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (req, s) => {
  const { rounds, ...data } = await parseBody(req, createDriveSchema);
  checkDriveShape(data);
  await assertDriveRefs(s.collegeId, data);
  return db.$transaction(async (tx) => {
    const d = await tx.drive.create({
      data: { ...data, collegeId: s.collegeId, createdById: s.userId, rounds: { create: rounds.map((r, i) => ({ ...r, order: i + 1 })) } },
      include: { rounds: { orderBy: { order: "asc" } } },
    });
    await audit(s, { action: "drive.create", entity: "Drive", entityId: d.id, after: { companyId: d.companyId, role: d.role } }, tx);
    return d;
  });
});
