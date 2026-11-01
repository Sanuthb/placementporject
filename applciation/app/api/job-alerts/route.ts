import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody, parseQuery } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertDriveRefs } from "@/lib/drives";
import { alertFields } from "@/lib/jobAlertSchema";
import { AlertStatus } from "@/generated/prisma/client";

const create = z.object(alertFields).extend({ targetDepartmentIds: alertFields.targetDepartmentIds.default([]), targetBatchIds: alertFields.targetBatchIds.default([]), targetSkills: alertFields.targetSkills.default([]) });
const query = z.object({ status: z.enum(AlertStatus).optional(), limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.uuid().optional() });

export const GET = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (req, s) => {
  const q = parseQuery(req, query);
  const rows = await db.jobAlert.findMany({
    where: { collegeId: s.collegeId, status: q.status }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: q.limit + 1, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > q.limit;
  const items = hasMore ? rows.slice(0, q.limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
});

/** Off-campus jobs and internships that are not formal drives. Created as a draft; publish to release. */
export const POST = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (req, s) => {
  const data = await parseBody(req, create);
  await assertDriveRefs(s.collegeId, { departmentIds: data.targetDepartmentIds, batchIds: data.targetBatchIds });
  return db.$transaction(async (tx) => {
    const a = await tx.jobAlert.create({ data: { ...data, collegeId: s.collegeId, createdById: s.userId } });
    await audit(s, { action: "jobAlert.create", entity: "JobAlert", entityId: a.id, after: { title: a.title } }, tx);
    return a;
  });
});
