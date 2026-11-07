import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/api/errors";
import { SESSION_STATUS } from "@/lib/api/academic";

const academicYearInput = z
  .object({ name: z.string().trim().min(4).max(20), startDate: z.coerce.date(), endDate: z.coerce.date(), isCurrent: z.boolean().default(false), status: z.enum(SESSION_STATUS).default("UPCOMING") })
  .refine((v) => v.endDate > v.startDate, { message: "endDate must be after startDate", path: ["endDate"] });

export const GET = route({}, (_req, s) => db.academicYear.findMany({ where: { collegeId: s.collegeId }, orderBy: { startDate: "desc" } }));

export const POST = route({ roles: ["TPO_ADMIN"] }, async (req, s) => {
  const data = await parseBody(req, academicYearInput);
  if (await db.academicYear.findUnique({ where: { collegeId_name: { collegeId: s.collegeId, name: data.name } } }))
    throw new ApiError(409, "CONFLICT", "An academic year with this name already exists");
  return db.$transaction(async (tx) => {
    if (data.isCurrent) await tx.academicYear.updateMany({ where: { collegeId: s.collegeId, isCurrent: true }, data: { isCurrent: false } });
    const y = await tx.academicYear.create({ data: { ...data, collegeId: s.collegeId } });
    await audit(s, { action: "academicYear.create", entity: "AcademicYear", entityId: y.id, after: { name: y.name, isCurrent: y.isCurrent } }, tx);
    return y;
  });
});
