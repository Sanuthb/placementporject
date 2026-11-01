import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody, parseQuery } from "@/lib/api/parse";
import { badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { departmentScope } from "@/lib/auth/session";
import { createBlock } from "@/lib/blocking";
import { BlockSource } from "@/generated/prisma/client";

const query = z.object({
  state: z.enum(["active", "all"]).default("active"), source: z.enum(BlockSource).optional(), studentId: z.uuid().optional(), departmentId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.uuid().optional(),
});
const create = z.object({ studentId: z.uuid(), reason: z.string().trim().min(3).max(500), endsAt: z.coerce.date() });

/** All blocks, filtered. "active" means in force right now. */
export const GET = route({ module: "ATTENDANCE_BLOCKING" }, async (req, s) => {
  const q = parseQuery(req, query);
  const scope = departmentScope(s);
  const rows = await db.block.findMany({
    where: {
      collegeId: s.collegeId, source: q.source, studentId: q.studentId,
      ...(q.state === "active" ? { status: "ACTIVE", endsAt: { gt: new Date() } } : {}),
      student: { ...scope, ...(q.departmentId && !scope.departmentId ? { departmentId: q.departmentId } : {}) },
    },
    select: { id: true, source: true, reason: true, startsAt: true, endsAt: true, status: true, liftReason: true, liftedAt: true, notifiedAt: true, student: { select: { id: true, name: true, enrollmentNo: true, departmentId: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: q.limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > q.limit;
  const items = hasMore ? rows.slice(0, q.limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
});

export const POST = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ATTENDANCE_BLOCKING" }, async (req, s) => {
  const b = await parseBody(req, create);
  if (b.endsAt <= new Date()) throw badRequest("endsAt must be in the future");
  if (!(await db.student.findFirst({ where: { id: b.studentId, collegeId: s.collegeId }, select: { id: true } }))) throw notFound("Student not found");
  const block = await createBlock({ collegeId: s.collegeId, studentId: b.studentId, source: "MANUAL", reason: b.reason, endsAt: b.endsAt, createdById: s.userId });
  return { id: block.id, endsAt: block.endsAt, notified: !!(await db.block.findUnique({ where: { id: block.id }, select: { notifiedAt: true } }))?.notifiedAt };
});
