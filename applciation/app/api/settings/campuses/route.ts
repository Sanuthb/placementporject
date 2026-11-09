import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/api/errors";

const create = z.object({ name: z.string().trim().min(2).max(120), code: z.string().trim().toUpperCase().max(20).optional() });

export const GET = route({ facultyOk: true }, (_req, s) => db.campus.findMany({ where: { collegeId: s.collegeId }, orderBy: { name: "asc" } }));

export const POST = route({ roles: ["TPO_ADMIN"] }, async (req, s) => {
  const data = await parseBody(req, create);
  if (await db.campus.findUnique({ where: { collegeId_name: { collegeId: s.collegeId, name: data.name } } })) throw new ApiError(409, "CONFLICT", "A campus with this name already exists");
  return db.$transaction(async (tx) => {
    const c = await tx.campus.create({ data: { collegeId: s.collegeId, name: data.name, code: data.code || null } });
    await audit(s, { action: "campus.create", entity: "Campus", entityId: c.id, after: data }, tx);
    return c;
  });
});
