import { z } from "zod";
import { InvitationStatus, InviteStatus, OnboardingStatus, StudentStage, type Prisma } from "@/generated/prisma/client";
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
  /** Invitation state: pending, sent, accepted, expired or revoked. */
  invitationStatus: z.enum(InvitationStatus).optional(),
  /** Where the student is in onboarding (profile status). */
  profileStatus: z.enum(OnboardingStatus).optional(),
  /** Review state: NOT_SUBMITTED, IN_REVIEW, CHANGES_REQUESTED, VERIFIED or REJECTED. */
  verificationStatus: z.enum(["NOT_SUBMITTED", "IN_REVIEW", "CHANGES_REQUESTED", "VERIFIED", "REJECTED"]).optional(),
  docStatus: z.enum(["PENDING", "VERIFIED", "REJECTED"]).optional(),
  placed: bool.optional(),
  isActive: bool.optional(),
  isArchived: bool.default(false),
});
const VERIFICATION: Record<string, OnboardingStatus[]> = {
  NOT_SUBMITTED: ["INVITATION_PENDING", "INVITATION_SENT", "INVITATION_ACCEPTED", "PROFILE_IN_PROGRESS", "INVITATION_EXPIRED"],
  IN_REVIEW: ["SUBMITTED", "VERIFICATION_IN_PROGRESS"],
  CHANGES_REQUESTED: ["CHANGES_REQUESTED"],
  VERIFIED: ["VERIFIED"],
  REJECTED: ["REJECTED"],
};
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
    ...(f.invitationStatus ? { invitation: { is: { status: f.invitationStatus } } } : {}),
    ...(f.profileStatus || f.verificationStatus
      ? { onboardingStatus: f.profileStatus ? f.profileStatus : { in: VERIFICATION[f.verificationStatus!] } }
      : {}),
    isPlaced: f.placed,
    isActive: f.isActive,
    isArchived: f.isArchived,
    ...(Object.keys(batch).length ? { batch } : {}),
    ...(f.docStatus ? { documents: { some: { status: f.docStatus } } } : {}),
    ...(f.q ? { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { enrollmentNo: { contains: f.q, mode: "insensitive" } }, { email: { contains: f.q, mode: "insensitive" } }] } : {}),
  };
}
