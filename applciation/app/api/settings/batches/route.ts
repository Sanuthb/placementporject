import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError, badRequest } from "@/lib/api/errors";
import { BATCH_STATUS, batchName } from "@/lib/api/academic";

/**
 * A batch is created once per programme and admission cycle. The programme sets the duration, so the end year and the
 * semesters are worked out here; the name is generated unless one is given.
 */
const create = z.object({
  programId: z.uuid(),
  admissionYear: z.number().int().min(1990).max(2100),
  startYear: z.number().int().min(1990).max(2100).optional(),
  branchId: z.uuid().nullable().optional(),
  coordinatorId: z.uuid().nullable().optional(),
  name: z.string().trim().min(2).max(60).optional(),
  status: z.enum(BATCH_STATUS).default("ACTIVE"),
});

export const GET = route({}, (_req, s) =>
  db.batch.findMany({
    where: { collegeId: s.collegeId },
    include: {
      program: { select: { id: true, name: true, code: true, departmentId: true, semesterCount: true } },
      branch: { select: { id: true, name: true } },
      coordinator: { select: { id: true, name: true } },
      _count: { select: { students: true, semesters: true } },
    },
    orderBy: [{ endYear: "desc" }, { name: "asc" }],
  }));

export const POST = route({ roles: ["TPO_ADMIN"] }, async (req, s) => {
  const data = await parseBody(req, create);
  const program = await db.program.findFirst({ where: { id: data.programId, collegeId: s.collegeId } });
  if (!program) throw badRequest("Programme not found");
  if (data.branchId && !(await db.programmeBranch.findFirst({ where: { id: data.branchId, programId: program.id } }))) throw badRequest("That branch does not belong to the chosen programme");
  if (data.coordinatorId && !(await db.user.findFirst({ where: { id: data.coordinatorId, collegeId: s.collegeId, isActive: true } }))) throw badRequest("Coordinator not found");

  const startYear = data.startYear ?? data.admissionYear;
  const endYear = startYear + program.durationYears;
  const name = data.name ?? batchName(program.code, startYear, endYear);
  if (await db.batch.findUnique({ where: { collegeId_name: { collegeId: s.collegeId, name } } })) throw new ApiError(409, "CONFLICT", `A batch named "${name}" already exists`);

  return db.$transaction(async (tx) => {
    const b = await tx.batch.create({
      data: { collegeId: s.collegeId, programId: program.id, name, startYear, endYear, admissionYear: data.admissionYear, branchId: data.branchId ?? null, coordinatorId: data.coordinatorId ?? null, status: data.status, isActive: data.status !== "ARCHIVED" },
    });
    // The batch stays the same for the whole programme; its semesters are created up front and dated later.
    await tx.semester.createMany({ data: Array.from({ length: program.semesterCount }, (_, i) => ({ collegeId: s.collegeId, batchId: b.id, number: i + 1, name: `Semester ${i + 1}` })) });
    await audit(s, { action: "batch.create", entity: "Batch", entityId: b.id, after: { name, programId: program.id, semesters: program.semesterCount } }, tx);
    return b;
  });
});
