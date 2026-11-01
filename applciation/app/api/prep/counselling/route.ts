import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody, parseQuery } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { SlotState } from "@/generated/prisma/client";

const query = z.object({ status: z.enum(SlotState).optional(), upcoming: z.enum(["true", "false"]).default("false") });
const create = z.object({ counsellorId: z.uuid().optional(), slots: z.array(z.object({ startsAt: z.coerce.date(), endsAt: z.coerce.date() }).refine((v) => v.endsAt > v.startsAt && v.endsAt.getTime() - v.startsAt.getTime() <= 4 * 3_600_000, { message: "A slot must end after it starts and last at most 4 hours" })).min(1).max(100) });

export const GET = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "STUDENT_PREP" }, async (req, s) => {
  const q = parseQuery(req, query);
  return db.counsellingSlot.findMany({ where: { collegeId: s.collegeId, status: q.status, ...(q.upcoming === "true" ? { startsAt: { gt: new Date() } } : {}) }, include: { counsellor: { select: { id: true, name: true } }, student: { select: { id: true, name: true, enrollmentNo: true } } }, orderBy: { startsAt: "asc" }, take: 300 });
});

/** Opens counselling slots (default counsellor is you). Overlapping slots for the same counsellor are refused. */
export const POST = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "STUDENT_PREP" }, async (req, s) => {
  const b = await parseBody(req, create);
  const counsellorId = b.counsellorId ?? s.userId;
  if (!(await db.user.findFirst({ where: { id: counsellorId, collegeId: s.collegeId, isActive: true } }))) throw badRequest("Counsellor not found");
  const sorted = [...b.slots].sort((x, y) => x.startsAt.getTime() - y.startsAt.getTime());
  for (let i = 1; i < sorted.length; i++) if (sorted[i].startsAt < sorted[i - 1].endsAt) throw badRequest("The slots you sent overlap each other");
  const clash = await db.counsellingSlot.findFirst({ where: { counsellorId, status: { in: ["OPEN", "BOOKED"] }, OR: sorted.map((x) => ({ startsAt: { lt: x.endsAt }, endsAt: { gt: x.startsAt } })) } });
  if (clash) throw badRequest("This counsellor already has a slot that overlaps");
  return db.$transaction(async (tx) => {
    const r = await tx.counsellingSlot.createMany({ data: sorted.map((x) => ({ collegeId: s.collegeId, counsellorId, startsAt: x.startsAt, endsAt: x.endsAt })) });
    await audit(s, { action: "counselling.open", entity: "CounsellingSlot", after: { counsellorId, slots: r.count } }, tx);
    return { created: r.count };
  });
});
