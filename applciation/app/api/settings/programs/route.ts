import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError, badRequest } from "@/lib/api/errors";
import { programCreate } from "@/lib/api/academic";
import { resolveUniversity } from "@/lib/academicIntegrity";

const create = programCreate

export const GET = route({ facultyOk: true }, (_req, s) =>
  db.program.findMany({
    where: { collegeId: s.collegeId },
    include: { department: { select: { id: true, name: true, code: true } }, uni: { select: { id: true, name: true, code: true } }, branches: { where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  }));

export const POST = route({ roles: ["TPO_ADMIN"] }, async (req, s) => {
  const data = await parseBody(req, create);
  if (!(await db.department.findFirst({ where: { id: data.departmentId, collegeId: s.collegeId } }))) throw badRequest("Department not found");
  if (await db.program.findUnique({ where: { collegeId_code: { collegeId: s.collegeId, code: data.code } } }))
    throw new ApiError(409, "CONFLICT", "A programme with this code already exists");
  return db.$transaction(async (tx) => {
    const rest = { ...data };
    delete rest.universityId;
    delete rest.university;
    const uni = (await resolveUniversity(tx, s.collegeId, data)) ?? { universityId: null, university: null };
    const p = await tx.program.create({ data: { ...rest, ...uni, collegeId: s.collegeId } });
    await audit(s, { action: "program.create", entity: "Program", entityId: p.id, after: { ...rest, ...uni } }, tx);
    return p;
  });
});
