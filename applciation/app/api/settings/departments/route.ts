import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/api/errors";

const create = z.object({ name: z.string().trim().min(2).max(120), code: z.string().trim().toUpperCase().min(1).max(20) });

export const GET = route({}, (_req, s) =>
  db.department.findMany({ where: { collegeId: s.collegeId }, orderBy: { name: "asc" } }),
);

export const POST = route({ roles: ["TPO_ADMIN"] }, async (req, s) => {
  const data = await parseBody(req, create);
  const exists = await db.department.findUnique({ where: { collegeId_code: { collegeId: s.collegeId, code: data.code } } });
  if (exists) throw new ApiError(409, "CONFLICT", "A department with this code already exists");
  return db.$transaction(async (tx) => {
    const d = await tx.department.create({ data: { ...data, collegeId: s.collegeId } });
    await audit(s, { action: "department.create", entity: "Department", entityId: d.id, after: data }, tx);
    return d;
  });
});
