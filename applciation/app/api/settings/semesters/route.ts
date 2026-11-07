import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody, parseQuery } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError, badRequest } from "@/lib/api/errors";

const query = z.object({ batchId: z.uuid().optional() });
const create = z.object({ batchId: z.uuid(), number: z.number().int().min(1).max(20), name: z.string().trim().min(1).max(40).optional() });

export const GET = route({}, (req, s) => {
  const { batchId } = parseQuery(req, query);
  return db.semester.findMany({
    where: { collegeId: s.collegeId, ...(batchId ? { batchId } : {}) },
    include: { academicYear: { select: { id: true, name: true } }, batch: { select: { id: true, name: true } }, _count: { select: { studentsNow: true } } },
    orderBy: [{ batchId: "asc" }, { number: "asc" }],
  });
});

export const POST = route({ roles: ["TPO_ADMIN"] }, async (req, s) => {
  const data = await parseBody(req, create);
  if (!(await db.batch.findFirst({ where: { id: data.batchId, collegeId: s.collegeId } }))) throw badRequest("Batch not found");
  if (await db.semester.findUnique({ where: { batchId_number: { batchId: data.batchId, number: data.number } } })) throw new ApiError(409, "CONFLICT", `Semester ${data.number} already exists for this batch`);
  return db.$transaction(async (tx) => {
    const m = await tx.semester.create({ data: { collegeId: s.collegeId, batchId: data.batchId, number: data.number, name: data.name ?? `Semester ${data.number}` } });
    await audit(s, { action: "semester.create", entity: "Semester", entityId: m.id, after: data }, tx);
    return m;
  });
});
