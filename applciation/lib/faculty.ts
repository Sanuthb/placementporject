import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { badRequest, notFound } from "@/lib/api/errors";

type Tx = Prisma.TransactionClient | typeof db;

export const profileFields = z.object({
  employeeId: z.string().trim().min(1).max(40).nullable().optional(),
  designation: z.string().trim().max(80).nullable().optional(),
  qualification: z.string().trim().max(120).nullable().optional(),
  specialisation: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  joinedOn: z.coerce.date().nullable().optional(),
});
export const allocationFields = z.object({
  departmentIds: z.array(z.uuid()).max(20).optional(),
  programIds: z.array(z.uuid()).max(100).optional(),
  batchIds: z.array(z.uuid()).max(200).optional(),
});

export const facultySelect = {
  id: true, email: true, name: true, role: true, extraRoles: true, isActive: true, createdAt: true,
  facultyProfile: { select: { employeeId: true, designation: true, qualification: true, specialisation: true, phone: true, joinedOn: true } },
  facultyDepartments: { select: { department: { select: { id: true, name: true, code: true } } } },
  facultyPrograms: { select: { program: { select: { id: true, name: true, code: true } } } },
  facultyBatches: { select: { batch: { select: { id: true, name: true } } } },
  _count: { select: { mentees: true } },
} satisfies Prisma.UserSelect;

type Row = Prisma.UserGetPayload<{ select: typeof facultySelect }>;
export const shapeFaculty = (u: Row) => ({
  id: u.id, email: u.email, name: u.name, isActive: u.isActive, createdAt: u.createdAt,
  roles: [u.role, ...u.extraRoles.filter((r) => r !== u.role)],
  profile: u.facultyProfile,
  departments: u.facultyDepartments.map((x) => x.department),
  programs: u.facultyPrograms.map((x) => x.program),
  batches: u.facultyBatches.map((x) => x.batch),
  menteeCount: u._count.mentees,
});

export const isFacultyWhere = (collegeId: string): Prisma.UserWhereInput => ({ collegeId, OR: [{ role: "FACULTY" }, { extraRoles: { has: "FACULTY" } }] });

/** The user must be a faculty member of this college. Another college's faculty look exactly like a missing one. */
export async function loadFaculty(tx: Tx, collegeId: string, id: string) {
  const u = await tx.user.findFirst({ where: { id, ...isFacultyWhere(collegeId) }, select: { id: true, isActive: true } });
  if (!u) throw notFound("Faculty member not found");
  return u;
}

/**
 * Replaces the parts of a faculty member's allocation that were sent. Rules:
 *  - everything named must belong to the same college
 *  - a programme or batch can only be allocated inside the faculty member's own departments
 *    (so allocation never reaches into a department they are not part of)
 */
export async function applyAllocations(tx: Tx, collegeId: string, userId: string, a: z.infer<typeof allocationFields>) {
  const current = {
    departmentIds: a.departmentIds ?? (await tx.facultyDepartment.findMany({ where: { userId }, select: { departmentId: true } })).map((x) => x.departmentId),
  };
  const departmentIds = [...new Set(current.departmentIds)];
  if (departmentIds.length) {
    const n = await tx.department.count({ where: { id: { in: departmentIds }, collegeId, isActive: true } });
    if (n !== departmentIds.length) throw badRequest("A department was not found or is inactive");
  }
  const inDept = (d: string | null) => d !== null && departmentIds.includes(d);

  const programIds = a.programIds ? [...new Set(a.programIds)] : undefined;
  const batchIds = a.batchIds ? [...new Set(a.batchIds)] : undefined;
  // Existing allocations are re-checked when departments shrink, so a removed department cannot leave programmes behind.
  const progs = await tx.program.findMany({ where: { id: { in: programIds ?? (await tx.facultyProgram.findMany({ where: { userId }, select: { programId: true } })).map((x) => x.programId) }, collegeId }, select: { id: true, name: true, departmentId: true } });
  if (programIds && progs.length !== programIds.length) throw badRequest("A programme was not found");
  for (const p of progs) if (!inDept(p.departmentId)) throw badRequest(`${p.name} is not offered by one of this faculty member's departments`);

  const batches = await tx.batch.findMany({ where: { id: { in: batchIds ?? (await tx.facultyBatch.findMany({ where: { userId }, select: { batchId: true } })).map((x) => x.batchId) }, collegeId }, select: { id: true, name: true, program: { select: { departmentId: true } } } });
  if (batchIds && batches.length !== batchIds.length) throw badRequest("A batch was not found");
  for (const b of batches) if (!inDept(b.program?.departmentId ?? null)) throw badRequest(`${b.name} is not in one of this faculty member's departments`);

  if (a.departmentIds) {
    await tx.facultyDepartment.deleteMany({ where: { userId } });
    if (departmentIds.length) await tx.facultyDepartment.createMany({ data: departmentIds.map((departmentId) => ({ userId, departmentId, collegeId })) });
  }
  if (programIds) {
    await tx.facultyProgram.deleteMany({ where: { userId } });
    if (programIds.length) await tx.facultyProgram.createMany({ data: programIds.map((programId) => ({ userId, programId, collegeId })) });
  }
  if (batchIds) {
    await tx.facultyBatch.deleteMany({ where: { userId } });
    if (batchIds.length) await tx.facultyBatch.createMany({ data: batchIds.map((batchId) => ({ userId, batchId, collegeId })) });
  }
  return { departmentIds, programIds: progs.map((p) => p.id), batchIds: batches.map((b) => b.id) };
}

/** The students a faculty member may see: their mentees and the students of their allocated batches and programmes, in their own college only. */
export async function facultyStudentWhere(collegeId: string, userId: string): Promise<Prisma.StudentWhereInput> {
  const [progs, batches] = await Promise.all([
    db.facultyProgram.findMany({ where: { userId, collegeId }, select: { programId: true } }),
    db.facultyBatch.findMany({ where: { userId, collegeId }, select: { batchId: true } }),
  ]);
  return {
    collegeId, isArchived: false,
    OR: [{ mentorId: userId }, { programId: { in: progs.map((p) => p.programId) } }, { batchId: { in: batches.map((b) => b.batchId) } }],
  };
}

