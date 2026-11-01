import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody, parseQuery } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertDriveRefs } from "@/lib/drives";
import { EventMode, EventStatus, EventType } from "@/generated/prisma/client";

const query = z.object({ status: z.enum(EventStatus).optional(), type: z.enum(EventType).optional(), limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.uuid().optional() });
const create = z.object({
  type: z.enum(EventType), title: z.string().trim().min(3).max(200), description: z.string().trim().max(10_000).optional(), mode: z.enum(EventMode), venue: z.string().trim().max(200).optional(), joinUrl: z.url().optional(),
  startsAt: z.coerce.date(), endsAt: z.coerce.date(), registrationDeadline: z.coerce.date().optional(), capacity: z.number().int().min(1).max(100000).optional(),
  targetDepartmentIds: z.array(z.uuid()).max(100).default([]), targetBatchIds: z.array(z.uuid()).max(100).default([]),
}).refine((v) => v.endsAt > v.startsAt, { message: "endsAt must be after startsAt", path: ["endsAt"] })
  .refine((v) => !v.registrationDeadline || v.registrationDeadline <= v.startsAt, { message: "Registration must close before the event starts", path: ["registrationDeadline"] })
  .refine((v) => v.mode === "ONSITE" || !!v.joinUrl, { message: "A virtual or hybrid event needs a joinUrl", path: ["joinUrl"] });

export const GET = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "EVENTS" }, async (req, s) => {
  const q = parseQuery(req, query);
  const rows = await db.event.findMany({
    where: { collegeId: s.collegeId, status: q.status, type: q.type }, include: { _count: { select: { registrations: true } } },
    orderBy: [{ startsAt: "desc" }, { id: "asc" }], take: q.limit + 1, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > q.limit;
  const items = hasMore ? rows.slice(0, q.limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
});

export const POST = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "EVENTS" }, async (req, s) => {
  const b = await parseBody(req, create);
  await assertDriveRefs(s.collegeId, { departmentIds: b.targetDepartmentIds, batchIds: b.targetBatchIds });
  return db.$transaction(async (tx) => {
    const e = await tx.event.create({ data: { ...b, collegeId: s.collegeId, createdById: s.userId } });
    await audit(s, { action: "event.create", entity: "Event", entityId: e.id, after: { title: e.title, type: e.type } }, tx);
    return e;
  });
});
