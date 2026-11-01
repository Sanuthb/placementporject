import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertDriveRefs } from "@/lib/drives";

const patch = z.object({
  title: z.string().trim().min(3).max(200).optional(), description: z.string().trim().max(10_000).optional(), venue: z.string().trim().max(200).optional(), joinUrl: z.url().optional(),
  startsAt: z.coerce.date().optional(), endsAt: z.coerce.date().optional(), registrationDeadline: z.coerce.date().nullable().optional(), capacity: z.number().int().min(1).max(100000).nullable().optional(),
  targetDepartmentIds: z.array(z.uuid()).max(100).optional(), targetBatchIds: z.array(z.uuid()).max(100).optional(),
});
const R = { roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] as ("TPO_ADMIN" | "PLACEMENT_OFFICER")[], module: "EVENTS" as const };

export const GET = route<{ id: string }>(R, async (_req, s, { id }) => {
  const e = await db.event.findFirst({ where: { id, collegeId: s.collegeId } });
  if (!e) throw notFound("Event not found");
  const by = await db.eventRegistration.groupBy({ by: ["status"], where: { eventId: id }, _count: true });
  return { ...e, counts: Object.fromEntries(by.map((x) => [x.status, x._count])) };
});

export const PATCH = route<{ id: string }>(R, async (req, s, { id }) => {
  const b = await parseBody(req, patch);
  const before = await db.event.findFirst({ where: { id, collegeId: s.collegeId } });
  if (!before) throw notFound("Event not found");
  if (before.status === "COMPLETED" || before.status === "CANCELLED") throw new ApiError(409, "CONFLICT", `A ${before.status.toLowerCase()} event cannot be edited`);
  if ((b.endsAt ?? before.endsAt) <= (b.startsAt ?? before.startsAt)) throw new ApiError(400, "BAD_REQUEST", "endsAt must be after startsAt");
  await assertDriveRefs(s.collegeId, { departmentIds: b.targetDepartmentIds, batchIds: b.targetBatchIds });
  return db.$transaction(async (tx) => {
    const after = await tx.event.update({ where: { id }, data: b });
    await audit(s, { action: "event.update", entity: "Event", entityId: id, after: b as object }, tx);
    return after;
  });
});
