import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError, badRequest } from "@/lib/api/errors";

const create = z
  .object({ name: z.string().trim().min(2).max(40), startYear: z.number().int().min(1990).max(2100), endYear: z.number().int().min(1990).max(2100), programId: z.uuid().nullable().optional() })
  .refine((v) => v.endYear > v.startYear, { message: "endYear must be after startYear", path: ["endYear"] });

export const GET = route({}, (_req, s) => db.batch.findMany({ where: { collegeId: s.collegeId }, include: { program: { select: { id: true, name: true, code: true } } }, orderBy: { endYear: "desc" } }));

export const POST = route({ roles: ["TPO_ADMIN"] }, async (req, s) => {
  const data = await parseBody(req, create);
  if (data.programId && !(await db.program.findFirst({ where: { id: data.programId, collegeId: s.collegeId } }))) throw badRequest("Program not found");
  if (await db.batch.findUnique({ where: { collegeId_name: { collegeId: s.collegeId, name: data.name } } }))
    throw new ApiError(409, "CONFLICT", "A batch with this name already exists");
  return db.$transaction(async (tx) => {
    const b = await tx.batch.create({ data: { ...data, collegeId: s.collegeId } });
    await audit(s, { action: "batch.create", entity: "Batch", entityId: b.id, after: { name: b.name } }, tx);
    return b;
  });
});
