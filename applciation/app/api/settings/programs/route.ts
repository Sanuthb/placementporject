import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/api/errors";

const create = z.object({ name: z.string().trim().min(2).max(120), code: z.string().trim().toUpperCase().min(1).max(20) });

export const GET = route({}, (_req, s) => db.program.findMany({ where: { collegeId: s.collegeId }, orderBy: { name: "asc" } }));

export const POST = route({ roles: ["TPO_ADMIN"] }, async (req, s) => {
  const data = await parseBody(req, create);
  if (await db.program.findUnique({ where: { collegeId_code: { collegeId: s.collegeId, code: data.code } } }))
    throw new ApiError(409, "CONFLICT", "A program with this code already exists");
  return db.$transaction(async (tx) => {
    const p = await tx.program.create({ data: { ...data, collegeId: s.collegeId } });
    await audit(s, { action: "program.create", entity: "Program", entityId: p.id, after: data }, tx);
    return p;
  });
});
