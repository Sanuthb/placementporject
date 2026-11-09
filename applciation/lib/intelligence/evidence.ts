import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { listOf } from "@/lib/resume";
import type { PsychScores } from "@/lib/psychometrics";

/**
 * Student 360° intelligence: the evidence side. Every number here is computed by code from records, never by an AI.
 * Each dimension keeps its own score (there is deliberately no single overall score), says whether it was measured,
 * declared by the student, or has no data, and lists the gaps that limit how far it can be trusted.
 */
export type Kind = "measured" | "declared" | "none";
export type Confidence = "high" | "medium" | "low" | "none";
export type Item = { label: string; value: string | number | null; source: string; verified: boolean };
export type Dimension = { key: string; label: string; kind: Kind; score: number | null; confidence: Confidence; items: Item[]; gaps: string[]; note?: string };
export type JobFit = { driveId: string; role: string; company: string; tier: string | null; met: string[]; unmet: string[]; unknown: string[] };
export type Evidence = { dimensions: Dimension[]; jobFit: JobFit[]; context: { programme: string | null; department: string; batch: string; graduationYear: number; profileStatus: string; academicsVerified: boolean; documents: { verified: number; pending: number; rejected: number } }; personalityShared: boolean };

type Acad = { cgpa?: number; tenthPercentage?: number; twelfthPercentage?: number; activeBacklogs?: number; semesters?: Record<string, unknown>[] };
const num = (v: unknown) => { const n = typeof v === "string" ? parseFloat(v) : (v as number); return Number.isFinite(n) ? n : null; };
const round = (n: number) => Math.round(n * 10) / 10;
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : []);
const present = (d: unknown) => !!d && typeof d === "object" && Object.keys(d as object).length > 0;

export async function gatherEvidence(collegeId: string, studentId: string): Promise<Evidence> {
  const st = await db.student.findFirstOrThrow({
    where: { id: studentId, collegeId },
    select: {
      onboardingStatus: true, psychShareWithStaff: true, departmentId: true, batchId: true, programId: true,
      department: { select: { name: true } }, program: { select: { name: true } }, batch: { select: { name: true, endYear: true } },
      sections: { select: { section: true, status: true, data: true, pendingData: true } },
      educationRecords: { select: { level: true, qualification: true, percentage: true, cgpa: true, backlogs: true, status: true } },
      documents: { select: { status: true } },
      psychAttempt: { select: { scores: true, completedAt: true } },
      mockInterviews: { where: { status: "COMPLETED" }, select: { role: true, feedback: true } },
      assessmentAttempts: { where: { status: { not: "IN_PROGRESS" }, score: { not: null } }, select: { score: true, maxScore: true, schedule: { select: { title: true } } }, orderBy: { submittedAt: "desc" }, take: 20 },
    },
  });
  const sec = (name: string) => { const r = st.sections.find((x) => x.section === name); return r ? { verified: r.status === "VERIFIED", data: (present(r.data) ? r.data : r.pendingData) as Record<string, unknown> | null } : null; };
  const dims: Dimension[] = [];

  // --- Academics: verified records win; otherwise what the student declared, marked as unverified.
  const a = sec("ACADEMICS"), acad = (a?.data ?? {}) as Acad;
  const av = !!a?.verified;
  const parts: { label: string; value: number; weight: number; src: string }[] = [];
  if (num(acad.cgpa) !== null && num(acad.cgpa)! > 0) parts.push({ label: "CGPA (out of 10)", value: num(acad.cgpa)! * 10, weight: 0.5, src: "ACADEMICS section" });
  if (num(acad.twelfthPercentage)) parts.push({ label: "12th / PUC percentage", value: num(acad.twelfthPercentage)!, weight: 0.25, src: "ACADEMICS section" });
  if (num(acad.tenthPercentage)) parts.push({ label: "10th / SSLC percentage", value: num(acad.tenthPercentage)!, weight: 0.15, src: "ACADEMICS section" });
  const backlogs = num(acad.activeBacklogs);
  const wsum = parts.reduce((t, p) => t + p.weight, 0);
  const base = wsum ? parts.reduce((t, p) => t + p.value * p.weight, 0) / wsum : null;
  const trend = (acad.semesters ?? []).map((x) => num(x.sgpa ?? x.gpa ?? x.percentage)).filter((v): v is number => v !== null);
  dims.push({
    key: "academics", label: "Academic performance", kind: base === null ? "none" : "measured",
    score: base === null ? null : Math.max(0, round(base - Math.min(20, (backlogs ?? 0) * 5))),
    confidence: base === null ? "none" : av ? "high" : "medium",
    items: [
      ...parts.map((p) => ({ label: p.label, value: round(p.label.startsWith("CGPA") ? p.value / 10 : p.value), source: p.src, verified: av })),
      ...(backlogs !== null ? [{ label: "Active backlogs", value: backlogs, source: "ACADEMICS section", verified: av }] : []),
      ...(trend.length >= 2 ? [{ label: "Semester trend", value: `${trend[0]} → ${trend[trend.length - 1]} over ${trend.length} semesters`, source: "ACADEMICS section", verified: av }] : []),
      ...st.educationRecords.map((e) => ({ label: `${e.qualification} (${e.level})`, value: e.percentage != null ? `${Number(e.percentage)}%` : e.cgpa != null ? `CGPA ${Number(e.cgpa)}` : "no marks given", source: "Education history", verified: false })),
    ],
    gaps: [...(base === null ? ["No academic marks have been provided"] : []), ...(base !== null && !av ? ["Marks are student-declared and not yet verified by staff"] : []), ...(trend.length < 2 ? ["No semester-wise results, so the trend cannot be assessed"] : [])],
    note: "Score blends CGPA (50%), 12th (25%) and 10th (15%), minus 5 points per active backlog.",
  });

  // --- Aptitude: built-in test (only if the student agreed to share) and any scheduled assessments.
  const share = st.psychShareWithStaff;
  const psy = share ? (st.psychAttempt?.scores as PsychScores | undefined) : undefined;
  const aptItems: Item[] = [];
  const aptScores: number[] = [];
  if (psy) for (const [area, v] of Object.entries(psy.aptitude.byArea)) { aptItems.push({ label: `${area[0].toUpperCase()}${area.slice(1)} reasoning (built-in test, 10 questions)`, value: v, source: "Career assessment", verified: true }); aptScores.push(v); }
  for (const x of st.assessmentAttempts) { const m = Number(x.maxScore); if (m) { const pct = round((Number(x.score) / m) * 100); aptItems.push({ label: x.schedule.title, value: pct, source: "Scheduled assessment", verified: true }); aptScores.push(pct); } }
  dims.push({
    key: "aptitude", label: "Aptitude and reasoning", kind: aptScores.length ? "measured" : "none",
    score: aptScores.length ? round(aptScores.reduce((t, v) => t + v, 0) / aptScores.length) : null,
    confidence: !aptScores.length ? "none" : aptScores.length >= 4 ? "medium" : "low",
    items: aptItems,
    gaps: [...(!aptScores.length ? [share || !st.psychAttempt ? "No aptitude assessment has been taken" : "The student has not agreed to share assessment results with the placement office"] : []), ...(aptScores.length && aptScores.length < 4 ? ["Few data points: the built-in test has only 10 questions"] : [])],
  });

  // --- Personality (Big Five): descriptive only, and only with the student's consent.
  const traits = psy ? Object.entries(psy.personality) : [];
  dims.push({
    key: "personality", label: "Personality (Big Five)", kind: traits.length ? "measured" : "none", score: null, confidence: traits.length ? "low" : "none",
    items: traits.map(([t, v]) => ({ label: t.replace("_", " "), value: v.score, source: "Career assessment", verified: true })),
    gaps: traits.length ? ["Self-reported inventory: describes preferences, not ability"] : [st.psychAttempt && !share ? "The student has not agreed to share personality results with the placement office" : "Personality inventory not taken"],
    note: "Descriptive only. Never used to decide eligibility, shortlisting or hiring.",
  });
  dims.push({ key: "disc", label: "Behavioural style (DISC)", kind: "none", score: null, confidence: "none", items: [], gaps: ["No DISC assessment exists in the system yet"] });
  dims.push({ key: "riasec", label: "Career interests (RIASEC)", kind: "none", score: null, confidence: "none", items: [], gaps: ["No RIASEC assessment exists in the system yet. Declared interests are shown under Career preferences"] });

  // --- Technical competency: what the student lists. No test measures it yet, so no score is invented.
  const sk = sec("SKILLS"), pr = sec("PROJECTS"), it = sec("INTERNSHIPS");
  const skills = [...strs(sk?.data?.skills), ...strs(sk?.data?.programmingLanguages)];
  const certs = listOf(sk?.data, "certifications") as Record<string, unknown>[];
  const projects = listOf(pr?.data, "projects") as Record<string, unknown>[];
  const interns = listOf(it?.data, "internships") as Record<string, unknown>[];
  const dedupe = [...new Set(skills.map((x) => x.trim()))];
  dims.push({
    key: "technical", label: "Technical competencies", kind: dedupe.length || certs.length ? "declared" : "none", score: null, confidence: dedupe.length ? "low" : "none",
    items: [
      ...(dedupe.length ? [{ label: "Skills and languages listed", value: dedupe.slice(0, 25).join(", "), source: "SKILLS section", verified: !!sk?.verified }] : []),
      ...certs.slice(0, 8).map((c) => ({ label: `Certification: ${String(c.name ?? "")}`, value: String(c.issuer ?? "") || null, source: "SKILLS section", verified: !!sk?.verified })),
    ],
    gaps: ["Self-declared. No technical or coding assessment has been taken, so depth of skill is not measured", ...(!dedupe.length ? ["No skills listed"] : [])],
  });

  // --- Communication: only practice-interview scores exist today.
  const mock = st.mockInterviews.map((m) => ({ role: m.role, score: num((m.feedback as { score?: unknown } | null)?.score) })).filter((m): m is { role: string; score: number } => m.score !== null);
  dims.push({
    key: "communication", label: "Communication (practice interviews)", kind: mock.length ? "measured" : "none",
    score: mock.length ? round((mock.reduce((t, m) => t + m.score, 0) / mock.length) * 10) : null, confidence: mock.length >= 3 ? "medium" : mock.length ? "low" : "none",
    items: mock.map((m) => ({ label: `Practice interview: ${m.role}`, value: `${m.score}/10`, source: "AI mock interview", verified: false })),
    gaps: [...(!mock.length ? ["No practice interview taken and no communication assessment exists"] : ["AI-scored practice, not an examiner-graded communication test"])],
  });

  // --- Practical experience and career preferences: declared.
  dims.push({
    key: "experience", label: "Projects and internships", kind: projects.length || interns.length ? "declared" : "none", score: null, confidence: projects.length || interns.length ? "low" : "none",
    items: [
      ...projects.slice(0, 6).map((p) => ({ label: `Project: ${String(p.title ?? "")}`, value: String(p.tools ?? "") || null, source: "PROJECTS section", verified: !!pr?.verified })),
      ...interns.slice(0, 6).map((p) => ({ label: `Internship: ${String(p.company ?? "")}`, value: [p.role, p.duration].filter(Boolean).join(", ") || null, source: "INTERNSHIPS section", verified: !!it?.verified })),
    ],
    gaps: ["Self-declared and not independently checked", ...(!projects.length ? ["No projects listed"] : []), ...(!interns.length ? ["No internships listed"] : [])],
  });
  const interests = strs(sk?.data?.careerInterests), roles = strs(sk?.data?.preferredRoles);
  dims.push({
    key: "preferences", label: "Career preferences", kind: interests.length || roles.length ? "declared" : "none", score: null, confidence: interests.length || roles.length ? "medium" : "none",
    items: [...(interests.length ? [{ label: "Interests", value: interests.join(", "), source: "SKILLS section", verified: false }] : []), ...(roles.length ? [{ label: "Preferred roles", value: roles.join(", "), source: "SKILLS section", verified: false }] : [])],
    gaps: !interests.length && !roles.length ? ["The student has not stated career interests or preferred roles"] : [],
  });

  // --- Job fit: a plain comparison with the published drives' thresholds, before the student is onboarded.
  const drives = await db.drive.findMany({
    where: { collegeId, status: "PUBLISHED", applicationDeadline: { gt: new Date() } },
    select: { id: true, role: true, minCgpa: true, minTenthPct: true, minTwelfthPct: true, maxActiveBacklogs: true, departmentIds: true, batchIds: true, programIds: true, company: { select: { name: true, tier: true } } },
    orderBy: { driveDate: "asc" }, take: 12,
  });
  const check = (need: unknown, have: number | null, label: string, f: JobFit, hi = true) => {
    const n = num(need); if (n === null) return;
    if (have === null) f.unknown.push(`${label} (needs ${n})`);
    else if (hi ? have >= n : have <= n) f.met.push(`${label} ${have} meets ${hi ? "minimum" : "maximum"} ${n}`);
    else f.unmet.push(`${label} ${have} is ${hi ? "below" : "above"} ${hi ? "minimum" : "maximum"} ${n}`);
  };
  const jobFit = drives.map((d): JobFit => {
    const f: JobFit = { driveId: d.id, role: d.role, company: d.company.name, tier: d.company.tier, met: [], unmet: [], unknown: [] };
    check(d.minCgpa, num(acad.cgpa), "CGPA", f); check(d.minTenthPct, num(acad.tenthPercentage), "10th %", f); check(d.minTwelfthPct, num(acad.twelfthPercentage), "12th %", f); check(d.maxActiveBacklogs, backlogs, "Active backlogs", f, false);
    if (d.departmentIds.length) (d.departmentIds.includes(st.departmentId) ? f.met : f.unmet).push("Department " + (d.departmentIds.includes(st.departmentId) ? "is" : "is not") + " in the drive's list");
    if (d.batchIds.length) (d.batchIds.includes(st.batchId) ? f.met : f.unmet).push("Batch " + (d.batchIds.includes(st.batchId) ? "is" : "is not") + " in the drive's list");
    return f;
  });

  const docs = { verified: st.documents.filter((d) => d.status === "VERIFIED").length, pending: st.documents.filter((d) => d.status === "PENDING").length, rejected: st.documents.filter((d) => d.status === "REJECTED").length };
  return { dimensions: dims, jobFit, personalityShared: share, context: { programme: st.program?.name ?? null, department: st.department.name, batch: st.batch.name, graduationYear: st.batch.endYear, profileStatus: st.onboardingStatus, academicsVerified: av, documents: docs } };
}

/** Changes when any score, item or job-fit result changes, so a stored AI reading can be recognised as out of date. */
export const evidenceHash = (e: Evidence) => createHash("sha256").update(JSON.stringify({ d: e.dimensions.map((x) => [x.key, x.score, x.items, x.gaps]), j: e.jobFit, a: e.context.academicsVerified })).digest("hex");
