import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody, parseQuery } from "@/lib/api/parse";
import { ApiError, badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { departmentScope } from "@/lib/auth/session";
import { studentSelect } from "@/lib/students";
import { InviteStatus } from "@/generated/prisma/client";

const bool = z.enum(["true", "false"]).transform((v) => v === "true");
const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  departmentId: z.uuid().optional(),
  batchId: z.uuid().optional(),
  programId: z.uuid().optional(),
  inviteStatus: z.enum(InviteStatus).optional(),
  isActive: bool.optional(),
  isArchived: bool.default(false),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.uuid().optional(),
});

const create = z.object({
  enrollmentNo: z.string().trim().min(1).max(50),
  name: z.string().trim().min(2).max(120),
  email: z.email().transform((e) => e.toLowerCase()),
  phone: z.string().trim().regex(/^\+?[\d\s-]{7,16}$/).optional(),
  departmentId: z.uuid(),
  batchId: z.uuid(),
  programId: z.uuid().nullable().optional(),
});

export const GET = route({ module: "ONBOARDING" }, async (req, s) => {
  const q = parseQuery(req, listQuery);
  const rows = await db.student.findMany({
    where: {
      collegeId: s.collegeId,
      ...departmentScope(s),
      ...(q.departmentId && s.role !== "DEPARTMENT_COORDINATOR" ? { departmentId: q.departmentId } : {}),
      batchId: q.batchId,
      programId: q.programId,
      inviteStatus: q.inviteStatus,
      isActive: q.isActive,
      isArchived: q.isArchived,
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: "insensitive" } }, { enrollmentNo: { contains: q.q, mode: "insensitive" } }, { email: { contains: q.q, mode: "insensitive" } }] } : {}),
    },
    select: studentSelect,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: q.limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > q.limit;
  const items = hasMore ? rows.slice(0, q.limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
});

export const POST = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (req, s) => {
  const data = await parseBody(req, create);
  const [dept, batch, program, dupe] = await Promise.all([
    db.department.findFirst({ where: { id: data.departmentId, collegeId: s.collegeId, isActive: true } }),
    db.batch.findFirst({ where: { id: data.batchId, collegeId: s.collegeId, isActive: true } }),
    data.programId ? db.program.findFirst({ where: { id: data.programId, collegeId: s.collegeId, isActive: true } }) : Promise.resolve(true),
    db.student.findFirst({ where: { collegeId: s.collegeId, OR: [{ enrollmentNo: data.enrollmentNo }, { email: data.email }] }, select: { id: true } }),
  ]);
  if (!dept) throw badRequest("Department not found or inactive");
  if (!batch) throw badRequest("Batch not found or inactive");
  if (!program) throw badRequest("Program not found or inactive");
  if (dupe) throw new ApiError(409, "CONFLICT", "A student with this enrollment number or email already exists");

  return db.$transaction(async (tx) => {
    const st = await tx.student.create({ data: { ...data, programId: data.programId ?? null, collegeId: s.collegeId }, select: studentSelect });
    await audit(s, { action: "student.create", entity: "Student", entityId: st.id, after: { enrollmentNo: st.enrollmentNo, email: st.email } }, tx);
    return st;
  });
});
