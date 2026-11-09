import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody, parseQuery } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError, badRequest } from "@/lib/api/errors";

const create = z.object({ programId: z.uuid(), name: z.string().trim().min(2).max(80) });
const query = z.object({ programId: z.uuid().optional() });

export const GET = route({ facultyOk: true }, (req, s) => {
  const { programId } = parseQuery(req, query);
  return db.programmeBranch.findMany({ where: { collegeId: s.collegeId, ...(programId ? { programId } : {}) }, orderBy: { name: "asc" } });
});

export const POST = route({ roles: ["TPO_ADMIN"] }, async (req, s) => {
  const data = await parseBody(req, create);
  if (!(await db.program.findFirst({ where: { id: data.programId, collegeId: s.collegeId } }))) throw badRequest("Programme not found");
  if (await db.programmeBranch.findUnique({ where: { programId_name: data } })) throw new ApiError(409, "CONFLICT", "This programme already has a branch with that name");
  return db.$transaction(async (tx) => {
    const b = await tx.programmeBranch.create({ data: { ...data, collegeId: s.collegeId } });
    await audit(s, { action: "branch.create", entity: "ProgrammeBranch", entityId: b.id, after: data }, tx);
    return b;
  });
});
