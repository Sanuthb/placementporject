import { db } from "@/lib/db";
import type { JobDescription, ModuleKey, Role } from "@/generated/prisma/client";
import { badRequest, notFound } from "@/lib/api/errors";
import { evaluateEligibility } from "@/lib/eligibility";
import { checkEligibility } from "@/lib/internships";
import { jdData, type JdData } from "@/lib/jd";
import { matchStudent, prepSuggestions, rankCandidates, type MatchResult } from "@/lib/matching";
import { buildMaster } from "@/lib/resumeEngine";
import { loadInputsMany, loadMaster } from "@/lib/resumeService";

export const MATCH_ADMIN: { roles: Role[]; module: ModuleKey } = { roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" };
export const MAX_POOL = 1500;

export async function approvedJd(collegeId: string, id: string) {
  const j = await db.jobDescription.findFirst({ where: { id, collegeId } });
  if (!j) throw notFound("Job description not found");
  if (j.status !== "APPROVED") throw badRequest("Candidates are matched only to an approved job description");
  return { jd: j, data: jdData.parse(j.data) };
}

export type ElRow = { studentId: string; name: string; enrollmentNo: string; departmentId: string; eligible: boolean; viaException: boolean; blocked: boolean; reasons: string[] };
const staffWording = (r: string) => r.replace(/^Your /, "The student's ").replace(/^You already have/, "The student already has").replace(/^You /, "The student ");

/**
 * Who may be considered for this job, decided by the rules alone and kept apart from the score. For a job description with a drive it is the drive's own
 * evaluation (rules, exceptions and attendance blocks); otherwise the job description's rules applied to each student's verified academics.
 */
export async function eligibilityRows(jd: JobDescription, data: JdData): Promise<ElRow[]> {
  if (jd.driveId) {
    const drive = await db.drive.findUnique({ where: { id: jd.driveId } });
    if (drive) return (await evaluateEligibility(drive)).map((r) => ({ studentId: r.studentId, name: r.name, enrollmentNo: r.enrollmentNo, departmentId: r.departmentId, eligible: r.eligible, viaException: r.viaException, blocked: r.blocked, reasons: r.reasons }));
  }
  const e = data.eligibility;
  const rules = { minCgpa: e.minCgpa, minTenthPct: e.minTenthPct, minTwelfthPct: e.minTwelfthPct, maxActiveBacklogs: e.maxActiveBacklogs, departmentIds: e.departmentIds, batchIds: e.batchIds, programIds: e.programIds, allowPlaced: e.allowPlaced };
  const sts = await db.student.findMany({
    where: { collegeId: jd.collegeId, isActive: true, isArchived: false, stage: "ONBOARDED", participationStatus: "REGISTERED" },
    select: { id: true, name: true, enrollmentNo: true, departmentId: true, batchId: true, programId: true, isPlaced: true, sections: { where: { section: "ACADEMICS", status: "VERIFIED" }, select: { data: true } } }, orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  return sts.map((s) => {
    const reasons = checkEligibility(rules, { departmentId: s.departmentId, batchId: s.batchId, programId: s.programId, isPlaced: s.isPlaced, hasRunningInternship: false, onboarded: true, academics: (s.sections[0]?.data as never) ?? null }).map(staffWording);
    return { studentId: s.id, name: s.name, enrollmentNo: s.enrollmentNo, departmentId: s.departmentId, eligible: reasons.length === 0, viaException: false, blocked: false, reasons };
  });
}

export type Candidate = {
  studentId: string; name: string; enrollmentNo: string; department: string; eligible: boolean; viaException: boolean; reasons: string[]
  score: number; mandatoryStatus: MatchResult["mandatory"]["status"]; mandatoryMet: number; mandatoryTotal: number; skills: MatchResult["skills"]; cgpa: number | null; rank: number | null; shortlisted: boolean; applied: string | null
};

/** Every considered student, matched and ranked. Eligible students are ranked; the rest are listed with the reason, never scored against the others. */
export async function runMatch(jd: JobDescription, data: JdData, o: { departmentId?: string } = {}) {
  const [rows, deps, shortlisted, apps] = await Promise.all([
    eligibilityRows(jd, data), db.department.findMany({ where: { collegeId: jd.collegeId }, select: { id: true, name: true } }),
    db.jdShortlist.findMany({ where: { jdId: jd.id }, select: { studentId: true } }),
    jd.driveId ? db.application.findMany({ where: { driveId: jd.driveId }, select: { studentId: true, status: true } }) : Promise.resolve([]),
  ]);
  const dep = new Map(deps.map((d) => [d.id, d.name]));
  const inScope = rows.filter((r) => !o.departmentId || r.departmentId === o.departmentId);
  const eligible = inScope.filter((r) => r.eligible);
  const pool = eligible.slice(0, MAX_POOL);
  const inputs = await loadInputsMany(jd.collegeId, pool.map((r) => r.studentId));
  const sl = new Set(shortlisted.map((s) => s.studentId)), ap = new Map(apps.map((a) => [a.studentId, a.status as string]));
  const base = (r: ElRow) => ({ studentId: r.studentId, name: r.name, enrollmentNo: r.enrollmentNo, department: dep.get(r.departmentId) ?? "", viaException: r.viaException, shortlisted: sl.has(r.studentId), applied: ap.get(r.studentId) ?? null });
  const scored = pool.flatMap((r): Candidate[] => {
    const i = inputs.get(r.studentId);
    if (!i) return [];
    const master = buildMaster(i), res = matchStudent(data, master);
    return [{ ...base(r), eligible: true, reasons: [], score: res.score, mandatoryStatus: res.mandatory.status, mandatoryMet: res.mandatory.met, mandatoryTotal: res.mandatory.total, skills: res.skills, cgpa: master.academics.verified ? master.academics.cgpa : null, rank: null }];
  });
  const ranked = rankCandidates(scored);
  const ineligible: Candidate[] = inScope.filter((r) => !r.eligible).map((r) => ({ ...base(r), eligible: false, reasons: r.reasons, score: 0, mandatoryStatus: "NONE", mandatoryMet: 0, mandatoryTotal: 0, skills: { matched: [], partial: [], missing: [] }, cgpa: null, rank: null }));
  return { candidates: ranked, ineligible, truncated: eligible.length > MAX_POOL, considered: inScope.length };
}

/** What the college offers for the skills a student lacks: published courses and approved study material. */
export async function prepFor(collegeId: string, gaps: string[]) {
  if (!gaps.length) return [];
  const [courses, resources] = await Promise.all([
    db.course.findMany({ where: { collegeId, status: "PUBLISHED" }, select: { id: true, title: true, skills: true }, take: 300 }),
    db.prepResource.findMany({ where: { collegeId, status: "APPROVED", visibility: { not: "STAFF_ONLY" } }, select: { id: true, title: true, skills: true }, take: 500 }),
  ]);
  return prepSuggestions(gaps, courses, resources);
}

/** One student's full match with the evidence, for a reviewer. */
export async function matchOne(jd: JobDescription, data: JdData, studentId: string) {
  const st = await db.student.findFirst({ where: { id: studentId, collegeId: jd.collegeId }, select: { id: true, name: true, enrollmentNo: true, department: { select: { name: true } } } });
  if (!st) throw notFound("Student not found");
  const [rows, master] = await Promise.all([eligibilityRows(jd, data), loadMaster(jd.collegeId, studentId)]);
  const el = rows.find((r) => r.studentId === studentId);
  const result = matchStudent(data, master);
  const resumes = await db.resumeVersion.findMany({ where: { studentId, status: "APPROVED" }, orderBy: [{ isPrimary: "desc" }, { number: "desc" }], select: { id: true, title: true, isPrimary: true }, take: 5 });
  return { student: { id: st.id, name: st.name, enrollmentNo: st.enrollmentNo, department: st.department.name }, eligibility: el ? { eligible: el.eligible, viaException: el.viaException, reasons: el.reasons } : { eligible: false, viaException: false, reasons: ["Not registered or not onboarded for placement"] }, result, resumes, preparation: await prepFor(jd.collegeId, result.gaps) };
}
