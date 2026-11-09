import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/api/errors";
import { universityBase } from "@/lib/api/academic";

export const GET = route({ facultyOk: true }, (_req, s) =>
  db.university.findMany({ where: { collegeId: s.collegeId }, include: { _count: { select: { programs: true } } }, orderBy: { name: "asc" } }));

export const POST = route({ roles: ["TPO_ADMIN"] }, async (req, s) => {
  const data = await parseBody(req, universityBase);
  if (await db.university.findFirst({ where: { collegeId: s.collegeId, code: data.code } })) throw new ApiError(409, "CONFLICT", "A university with this code already exists");
  if (await db.university.findFirst({ where: { collegeId: s.collegeId, name: { equals: data.name, mode: "insensitive" } } })) throw new ApiError(409, "CONFLICT", "A university with this name already exists");
  return db.$transaction(async (tx) => {
    const u = await tx.university.create({ data: { ...data, collegeId: s.collegeId } });
    await audit(s, { action: "university.create", entity: "University", entityId: u.id, after: data }, tx);
    return u;
  });
});
