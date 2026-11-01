import type { Drive } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { activeBlocks } from "@/lib/blocking";
import { TIER_RANK } from "@/lib/ops/offers";

export type RuleDrive = Pick<Drive, "id" | "collegeId" | "companyId" | "minCgpa" | "minTenthPct" | "minTwelfthPct" | "maxActiveBacklogs" | "departmentIds" | "batchIds" | "programIds" | "allowPlaced">;

export type EligibilityRow = {
  studentId: string;
  name: string;
  enrollmentNo: string;
  departmentId: string;
  batchId: string;
  eligible: boolean;
  viaException: boolean;
  blocked: boolean; // an active block can never be waived by an exception
  reasons: string[]; // why the student fails the rules (kept even when an exception waives them)
};

type Academics = { cgpa?: number; tenthPercentage?: number; twelfthPercentage?: number; activeBacklogs?: number };
const num = (d: { toString(): string } | null) => (d === null ? null : Number(d.toString()));

/**
 * Evaluates who may apply to a drive.
 * Hard criteria (never waived): active, not archived, onboarded, registered for placement. Opted-out students never appear.
 * Rule criteria (can be waived by an exception): department/batch/program, placed status, and academic thresholds.
 * Only VERIFIED academics are trusted for threshold checks.
 */
export async function evaluateEligibility(drive: RuleDrive, scope: { departmentId?: string; studentId?: string } = {}): Promise<EligibilityRow[]> {
  const [students, exceptions, tierPolicy, company] = await Promise.all([
    db.student.findMany({
      where: {
        collegeId: drive.collegeId, isActive: true, isArchived: false, stage: "ONBOARDED", participationStatus: "REGISTERED",
        ...(scope.departmentId ? { departmentId: scope.departmentId } : {}),
        ...(scope.studentId ? { id: scope.studentId } : {}),
      },
      select: {
        id: true, name: true, enrollmentNo: true, departmentId: true, batchId: true, programId: true, isPlaced: true, placedTier: true,
        sections: { where: { section: "ACADEMICS", status: "VERIFIED" }, select: { data: true } },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    db.driveException.findMany({ where: { driveId: drive.id }, select: { studentId: true } }),
    db.blockPolicy.findFirst({ where: { collegeId: drive.collegeId, type: "PLACED_LOWER_TIER", isActive: true }, select: { id: true } }),
    db.company.findUnique({ where: { id: drive.companyId }, select: { tier: true } }),
  ]);
  const blocks = await activeBlocks(drive.collegeId, students.map((s) => s.id));
  const excepted = new Set(exceptions.map((e) => e.studentId));
  const minCgpa = num(drive.minCgpa), min10 = num(drive.minTenthPct), min12 = num(drive.minTwelfthPct);
  const needsAcademics = minCgpa !== null || min10 !== null || min12 !== null || drive.maxActiveBacklogs !== null;

  return students.map((s): EligibilityRow => {
    const reasons: string[] = [];
    if (drive.departmentIds.length && !drive.departmentIds.includes(s.departmentId)) reasons.push("Department is not eligible for this drive");
    if (drive.batchIds.length && !drive.batchIds.includes(s.batchId)) reasons.push("Batch is not eligible for this drive");
    if (drive.programIds.length && (!s.programId || !drive.programIds.includes(s.programId))) reasons.push("Program is not eligible for this drive");
    if (s.isPlaced && !drive.allowPlaced) reasons.push("Already placed; this drive does not allow placed students");
    if (tierPolicy && company && s.placedTier && TIER_RANK[company.tier] <= TIER_RANK[s.placedTier]) reasons.push("Placed students cannot apply to drives of the same or a lower tier");
    if (needsAcademics) {
      const a = s.sections[0]?.data as Academics | undefined;
      if (!a) reasons.push("Verified academics are required");
      else {
        if (minCgpa !== null && (a.cgpa ?? 0) < minCgpa) reasons.push(`CGPA ${a.cgpa} is below the minimum ${minCgpa}`);
        if (min10 !== null && (a.tenthPercentage ?? 0) < min10) reasons.push(`10th percentage ${a.tenthPercentage} is below the minimum ${min10}`);
        if (min12 !== null && (a.twelfthPercentage ?? 0) < min12) reasons.push(`12th percentage ${a.twelfthPercentage} is below the minimum ${min12}`);
        if (drive.maxActiveBacklogs !== null && (a.activeBacklogs ?? 0) > drive.maxActiveBacklogs) reasons.push(`${a.activeBacklogs} active backlogs exceeds the maximum ${drive.maxActiveBacklogs}`);
      }
    }
    const block = blocks.get(s.id);
    if (block) reasons.unshift(`Blocked until ${block.endsAt.toISOString().slice(0, 10)}: ${block.reason}`);
    const viaException = !block && reasons.length > 0 && excepted.has(s.id);
    return { studentId: s.id, name: s.name, enrollmentNo: s.enrollmentNo, departmentId: s.departmentId, batchId: s.batchId, eligible: !block && (reasons.length === 0 || viaException), viaException, blocked: !!block, reasons };
  });
}
