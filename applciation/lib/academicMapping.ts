import type { Prisma } from "@/generated/prisma/client";
import { badRequest } from "@/lib/api/errors";

type Tx = Prisma.TransactionClient;

export type MappingInput = {
  departmentId: string
  batchId: string
  programId?: string | null
  branchId?: string | null
  semesterId?: string | null
  academicYearId?: string | null
};

export type Mapping = {
  departmentId: string
  batchId: string
  programId: string | null
  branchId: string | null
  currentSemesterId: string | null
  currentAcademicYearId: string | null
};

/** A rule was broken. The message is written for the person fixing the data. */
export class MappingError extends Error {}

/** The active parts of the academic structure that a check needs, by id. */
export type Structure = {
  departments: Map<string, { id: string; name: string }>
  programs: Map<string, { id: string; name: string; departmentId: string | null }>
  branches: Map<string, { id: string; programId: string }>
  batches: Map<string, { id: string; name: string; programId: string | null; branchId: string | null }>
  semesters: Map<string, { id: string; batchId: string; academicYearId: string | null }>
  years: Set<string>
};

/**
 * The rules that make a student's department, programme, branch, batch and semester describe one real place in the academic
 * structure, and what follows from the batch. Pure: it only reads `st`, so the single-student path and the bulk import
 * (which checks thousands of rows against one loaded structure) cannot drift apart.
 *
 *  - the programme must belong to the department
 *  - the batch must belong to the programme (a batch with a programme sets it when none is given)
 *  - the branch must belong to the programme, and match the batch's branch when the batch has one
 *  - the semester must belong to the batch; its academic year is used when none is given
 */
export function checkMapping(st: Structure, i: MappingInput): Mapping {
  const dept = st.departments.get(i.departmentId);
  const batch = st.batches.get(i.batchId);
  if (!dept) throw new MappingError("Department not found or inactive");
  if (!batch) throw new MappingError("Batch not found or inactive");

  let programId = i.programId ?? null;
  if (batch.programId) {
    if (programId && programId !== batch.programId) throw new MappingError(`Batch ${batch.name} belongs to ${st.programs.get(batch.programId)?.name ?? "another programme"}, not the chosen programme`);
    programId = batch.programId;
  }
  if (programId) {
    const program = st.programs.get(programId);
    if (!program) throw new MappingError("Programme not found or inactive");
    if (program.departmentId && program.departmentId !== dept.id) throw new MappingError(`${program.name} is offered by a different department than ${dept.name}`);
  }

  let branchId = i.branchId ?? null;
  if (branchId) {
    if (!programId) throw new MappingError("Choose a programme before a branch");
    if (st.branches.get(branchId)?.programId !== programId) throw new MappingError("That branch does not belong to the chosen programme");
    if (batch.branchId && batch.branchId !== branchId) throw new MappingError("That branch does not match the batch's branch");
  } else if (batch.branchId) branchId = batch.branchId;

  const semesterId = i.semesterId ?? null;
  let academicYearId = i.academicYearId ?? null;
  if (semesterId) {
    const sem = st.semesters.get(semesterId);
    if (!sem || sem.batchId !== batch.id) throw new MappingError("That semester does not belong to the chosen batch");
    academicYearId ??= sem.academicYearId;
  }
  if (i.academicYearId && !st.years.has(i.academicYearId)) throw new MappingError("Academic year not found");

  return { departmentId: dept.id, batchId: batch.id, programId, branchId, currentSemesterId: semesterId, currentAcademicYearId: academicYearId };
}

/** Checks one student's mapping against the database, loading only the rows it names. */
export async function resolveMapping(tx: Tx, collegeId: string, i: MappingInput): Promise<Mapping> {
  const batch = await tx.batch.findFirst({ where: { id: i.batchId, collegeId, isActive: true }, select: { id: true, name: true, programId: true, branchId: true } });
  const programIds = [...new Set([i.programId, batch?.programId].filter((x): x is string => !!x))];
  const [dept, programs, branch, sem, year] = await Promise.all([
    tx.department.findFirst({ where: { id: i.departmentId, collegeId, isActive: true }, select: { id: true, name: true } }),
    programIds.length ? tx.program.findMany({ where: { id: { in: programIds }, collegeId, isActive: true }, select: { id: true, name: true, departmentId: true } }) : Promise.resolve([]),
    i.branchId ? tx.programmeBranch.findFirst({ where: { id: i.branchId, collegeId, isActive: true }, select: { id: true, programId: true } }) : Promise.resolve(null),
    i.semesterId ? tx.semester.findFirst({ where: { id: i.semesterId, collegeId }, select: { id: true, batchId: true, academicYearId: true } }) : Promise.resolve(null),
    i.academicYearId ? tx.academicYear.findFirst({ where: { id: i.academicYearId, collegeId }, select: { id: true } }) : Promise.resolve(null),
  ]);
  const st: Structure = {
    departments: new Map(dept ? [[dept.id, dept]] : []),
    programs: new Map(programs.map((p) => [p.id, p])),
    branches: new Map(branch ? [[branch.id, branch]] : []),
    batches: new Map(batch ? [[batch.id, batch]] : []),
    semesters: new Map(sem ? [[sem.id, sem]] : []),
    years: new Set(year ? [year.id] : []),
  };
  try {
    return checkMapping(st, i);
  } catch (e) {
    if (e instanceof MappingError) throw badRequest(e.message);
    throw e;
  }
}
