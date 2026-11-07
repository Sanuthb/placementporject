import { z } from "zod";
import { InviteStatus, StudentStage, type Prisma } from "@/generated/prisma/client";
import { departmentScope, type Session } from "@/lib/auth/session";

const bool = z.enum(["true", "false"]).transform((v) => v === "true");

/** The filters the Student Management screen offers. The list, the summary and the export all read the same ones. */
export const studentFilterQuery = z.object({
  q: z.string().trim().max(100).optional(),
  departmentId: z.uuid().optional(),
  programId: z.uuid().optional(),
  branchId: z.uuid().optional(),
  batchId: z.uuid().optional(),
  semesterId: z.uuid().optional(),
  academicYearId: z.uuid().optional(),
  admissionYear: z.coerce.number().int().min(1990).max(2100).optional(),
  graduationYear: z.coerce.number().int().min(1990).max(2100).optional(),
  stage: z.enum(StudentStage).optional(),
  inviteStatus: z.enum(InviteStatus).optional(),
  docStatus: z.enum(["PENDING", "VERIFIED", "REJECTED"]).optional(),
  placed: bool.optional(),
  isActive: bool.optional(),
  isArchived: bool.default(false),
});
export type StudentFilter = z.infer<typeof studentFilterQuery>;

/** Turns the filters into a query, always inside the caller's college and (for coordinators) their department. */
export function studentWhere(s: Session, f: StudentFilter): Prisma.StudentWhereInput {
  const scope = departmentScope(s);
  const batch: Prisma.BatchWhereInput = {};
  if (f.admissionYear) batch.OR = [{ admissionYear: f.admissionYear }, { admissionYear: null, startYear: f.admissionYear }];
  if (f.graduationYear) batch.endYear = f.graduationYear;
  return {
    collegeId: s.collegeId,
    ...scope,
    ...(f.departmentId && !scope.departmentId ? { departmentId: f.departmentId } : {}),
    programId: f.programId,
    branchId: f.branchId,
    batchId: f.batchId,
    currentSemesterId: f.semesterId,
    currentAcademicYearId: f.academicYearId,
    stage: f.stage,
    inviteStatus: f.inviteStatus,
    isPlaced: f.placed,
    isActive: f.isActive,
    isArchived: f.isArchived,
    ...(Object.keys(batch).length ? { batch } : {}),
    ...(f.docStatus ? { documents: { some: { status: f.docStatus } } } : {}),
    ...(f.q ? { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { enrollmentNo: { contains: f.q, mode: "insensitive" } }, { email: { contains: f.q, mode: "insensitive" } }] } : {}),
  };
}
