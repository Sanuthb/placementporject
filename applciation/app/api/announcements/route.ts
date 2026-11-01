import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertDriveRefs } from "@/lib/drives";

export const GET = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] }, (_req, s) => db.announcement.findMany({ where: { collegeId: s.collegeId }, orderBy: { publishedAt: "desc" }, take: 100 }));

const create = z.object({
  title: z.string().trim().min(3).max(200), body: z.string().trim().min(3).max(10_000),
  targetDepartmentIds: z.array(z.uuid()).max(100).default([]), targetBatchIds: z.array(z.uuid()).max(100).default([]),
  publishedAt: z.coerce.date().optional(), expiresAt: z.coerce.date().optional(),
}).refine((v) => !v.expiresAt || v.expiresAt > (v.publishedAt ?? new Date()), { message: "expiresAt must be after the publish time", path: ["expiresAt"] });

/** Shown on the student dashboard. Empty targets mean everyone. */
export const POST = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] }, async (req, s) => {
  const data = await parseBody(req, create);
  await assertDriveRefs(s.collegeId, { departmentIds: data.targetDepartmentIds, batchIds: data.targetBatchIds });
  return db.$transaction(async (tx) => {
    const a = await tx.announcement.create({ data: { ...data, collegeId: s.collegeId, createdById: s.userId } });
    await audit(s, { action: "announcement.create", entity: "Announcement", entityId: a.id, after: { title: a.title } }, tx);
    return a;
  });
});
