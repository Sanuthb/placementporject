import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { listOf } from "@/lib/resume";
import type { PsychScores } from "@/lib/psychometrics";
import { latestBy } from "@/lib/reassessment";
import { instrumentByKey } from "@/lib/instruments/index";
import type { Result } from "@/lib/instruments/types";

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
/** What the ranking dimensions found, for recommendations (RIASEC letters and behavioural styles, strongest first). Null when not available to the viewer. */
export type Signals = { riasecRanking: string[] | null; styleRanking: string[] | null };
export type Evidence = { signals?: Signals; dimensions: Dimension[]; jobFit: JobFit[]; context: { programme: string | null; department: string; batch: string; graduationYear: number; profileStatus: string; academicsVerified: boolean; documents: { verified: number; pending: number; rejected: number } }; personalityShared: boolean };

type Acad = { cgpa?: number; tenthPercentage?: number; twelfthPercentage?: number; activeBacklogs?: number; semesters?: Record<string, unknown>[] };
const num = (v: unknown) => { const n = typeof v === "string" ? parseFloat(v) : (v as number); return Number.isFinite(n) ? n : null; };
const round = (n: number) => Math.round(n * 10) / 10;
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : []);
const present = (d: unknown) => !!d && typeof d === "object" && Object.keys(d as object).length > 0;

/** `asStudent`: the student looking at their own profile, who may always see their own private results. Staff see them only when the student shares. */
export async function gatherEvidence(collegeId: string, studentId: string, opts: { asStudent?: boolean } = {}): Promise<Evidence> {
  const st = await db.student.findFirstOrThrow({
    where: { id: studentId, collegeId },
    select: {
      onboardingStatus: true, psychShareWithStaff: true, departmentId: true, batchId: true, programId: true,
      department: { select: { name: true } }, program: { select: { name: true } }, batch: { select: { name: true, endYear: true } },
      sections: { select: { section: true, status: true, data: true, pendingData: true } },
      educationRecords: { select: { level: true, qualification: true, percentage: true, cgpa: true, backlogs: true, status: true } },
      documents: { where: { archivedAt: null }, select: { status: true } },
      psychAttempts: { where: { isCurrent: true }, select: { scores: true, completedAt: true }, take: 1 },
      mockInterviews: { where: { status: "COMPLETED" }, select: { role: true, feedback: true } },
      assessmentAttempts: { where: { status: { not: "IN_PROGRESS" }, reviewStatus: { not: "PENDING" }, score: { not: null } }, select: { score: true, maxScore: true, attemptNumber: true, scheduleId: true, schedule: { select: { title: true, isPractice: true, paper: { select: { category: true } } } } }, orderBy: { submittedAt: "desc" }, take: 60 },
      instrumentAttempts: { where: { isCurrent: true }, select: { instrumentKey: true, scores: true, completedAt: true } },
    },
  });
  const sec = (name: string) => { const r = st.sections.find((x) => x.section === name); return r ? { verified: r.status === "VERIFIED", data: (present(r.data) ? r.data : r.pendingData) as Record<string, unknown> | null } : null; };
  const dims: Dimension[] = [];
  // Scheduled tests count once each (the newest attempt), grouped by what they measure. Practice tests are for learning and are not scored here.
  const tests = latestBy(st.assessmentAttempts.filter((x) => !x.schedule.isPractice), (x) => x.scheduleId);
  const byCategory = (...cats: string[]) => tests.filter((x) => cats.includes(x.schedule.paper.category)).map((x) => ({ title: x.schedule.title, pct: Number(x.maxScore) ? round((Number(x.score) / Number(x.maxScore)) * 100) : 0, attempt: x.attemptNumber }));
  const testItems = (rows: ReturnType<typeof byCategory>): Item[] => rows.map((r) => ({ label: r.attempt > 1 ? `${r.title} (attempt ${r.attempt})` : r.title, value: r.pct, source: "Scheduled assessment", verified: true }));
  const mean = (xs: number[]) => (xs.length ? round(xs.reduce((t, v) => t + v, 0) / xs.length) : null);
  const inst = (key: string) => { const a = st.instrumentAttempts.find((x) => x.instrumentKey === key); return a ? { result: a.scores as unknown as Result, at: a.completedAt } : null; };
  const confidenceFor = (n: number): Confidence => (n >= 3 ? "medium" : n >= 1 ? "low" : "none");

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
  const share = st.psychShareWithStaff || !!opts.asStudent;
  const psy = share ? (st.psychAttempts[0]?.scores as PsychScores | undefined) : undefined;
  const aptItems: Item[] = [];
  const aptScores: number[] = [];
  if (psy) for (const [area, v] of Object.entries(psy.aptitude.byArea)) { aptItems.push({ label: `${area[0].toUpperCase()}${area.slice(1)} reasoning (built-in test, 10 questions)`, value: v, source: "Career assessment", verified: true }); aptScores.push(v); }
  // Untagged scheduled tests keep counting as aptitude, as they did before categories existed.
  const apt = byCategory("APTITUDE", "OTHER"); aptItems.push(...testItems(apt)); aptScores.push(...apt.map((r) => r.pct));
  dims.push({
    key: "aptitude", label: "Aptitude and reasoning", kind: aptScores.length ? "measured" : "none",
    score: aptScores.length ? round(aptScores.reduce((t, v) => t + v, 0) / aptScores.length) : null,
    confidence: !aptScores.length ? "none" : aptScores.length >= 4 ? "medium" : "low",
    items: aptItems,
    gaps: [...(!aptScores.length ? [share || !st.psychAttempts.length ? "No aptitude assessment has been taken" : "The student has not agreed to share assessment results with the placement office"] : []), ...(aptScores.length && aptScores.length < 4 ? ["Few data points: the built-in test has only 10 questions"] : [])],
  });

  // --- Personality (Big Five): descriptive only, and only with the student's consent.
  const traits = psy ? Object.entries(psy.personality) : [];
  dims.push({
    key: "personality", label: "Personality (Big Five)", kind: traits.length ? "measured" : "none", score: null, confidence: traits.length ? "low" : "none",
    items: traits.map(([t, v]) => ({ label: t.replace("_", " "), value: v.score, source: "Career assessment", verified: true })),
    gaps: traits.length ? ["Self-reported inventory: describes preferences, not ability"] : [st.psychAttempts.length > 0 && !share ? "The student has not agreed to share personality results with the placement office" : "Personality inventory not taken"],
    note: "Descriptive only. Never used to decide eligibility, shortlisting or hiring.",
  });
  // --- Behavioural style and career interests: private tests, shown to staff only when the student shares them. Descriptive, never a verdict.
  const privateGap = (key: string, name: string) => (st.instrumentAttempts.some((x) => x.instrumentKey === key) && !share ? `The student has not agreed to share ${name} results with the placement office` : `${name} not taken yet`);
  const style = share ? inst("behavioural-style") : null, riasecTest = share ? inst("riasec") : null;
  dims.push({
    key: "disc", label: "Behavioural style (DISC model)", kind: style ? "measured" : "none", score: null, confidence: style ? "low" : "none",
    items: style ? style.result.ranking.map((k) => ({ label: instrumentByKey("behavioural-style")!.scales.find((x) => x.key === k)!.label, value: style.result.scales[k].score, source: "Career test", verified: true })) : [],
    gaps: style ? ["Self-described: compares the four styles with each other. It shows what stands out for the student, not who is better"] : [privateGap("behavioural-style", "behavioural style")],
    note: "Descriptive only. Never used to decide eligibility, shortlisting or hiring.",
  });
  dims.push({
    key: "riasec", label: "Career interests (RIASEC)", kind: riasecTest ? "measured" : "none", score: null, confidence: riasecTest ? "low" : "none",
    items: riasecTest ? riasecTest.result.ranking.map((k) => ({ label: instrumentByKey("riasec")!.scales.find((x) => x.key === k)!.label, value: riasecTest.result.scales[k].score, source: "Career test", verified: true })) : [],
    gaps: riasecTest ? ["Interests describe what the student may enjoy, not what they are able to do"] : [privateGap("riasec", "career interest"), "Declared interests are shown under Career preferences"],
    note: "Descriptive only. Never used to decide eligibility, shortlisting or hiring.",
  });

  // --- Technical competency: what the student lists. No test measures it yet, so no score is invented.
  const sk = sec("SKILLS"), pr = sec("PROJECTS"), it = sec("INTERNSHIPS");
  const skills = [...strs(sk?.data?.skills), ...strs(sk?.data?.programmingLanguages)];
  const certs = listOf(sk?.data, "certifications") as Record<string, unknown>[];
  const projects = listOf(pr?.data, "projects") as Record<string, unknown>[];
  const interns = listOf(it?.data, "internships") as Record<string, unknown>[];
  const dedupe = [...new Set(skills.map((x) => x.trim()))];
  const tech = byCategory("TECHNICAL");
  dims.push({
    key: "technical", label: "Technical competencies", kind: tech.length ? "measured" : dedupe.length || certs.length ? "declared" : "none", score: mean(tech.map((r) => r.pct)), confidence: tech.length ? confidenceFor(tech.length) : dedupe.length ? "low" : "none",
    items: [
      ...testItems(tech),
      ...(dedupe.length ? [{ label: "Skills and languages listed", value: dedupe.slice(0, 25).join(", "), source: "SKILLS section", verified: !!sk?.verified }] : []),
      ...certs.slice(0, 8).map((c) => ({ label: `Certification: ${String(c.name ?? "")}`, value: String(c.issuer ?? "") || null, source: "SKILLS section", verified: !!sk?.verified })),
    ],
    gaps: [...(tech.length ? [] : ["Self-declared. No technical assessment has been taken, so depth of skill is not measured"]), ...(tech.length && tech.length < 3 ? ["Few technical tests taken, so the score is only a rough guide"] : []), ...(!dedupe.length ? ["No skills listed"] : [])],
  });

  // --- Communication: written test (AI-marked), scheduled communication tests, and AI practice interviews.
  const mock = st.mockInterviews.map((m) => ({ role: m.role, score: num((m.feedback as { score?: unknown } | null)?.score) })).filter((m): m is { role: string; score: number } => m.score !== null);
  const writing = inst("communication-writing"), commTests = byCategory("COMMUNICATION");
  const commParts: number[] = [...commTests.map((r) => r.pct), ...(writing ? [writing.result.scales.overall.score] : []), ...(mock.length ? [round((mock.reduce((t, m) => t + m.score, 0) / mock.length) * 10)] : [])];
  dims.push({
    key: "communication", label: "Communication", kind: commParts.length ? "measured" : "none", score: mean(commParts), confidence: confidenceFor(commParts.length),
    items: [
      ...testItems(commTests),
      ...(writing ? [{ label: "Written communication (AI-marked email)", value: writing.result.scales.overall.score, source: "Career test", verified: false }] : []),
      ...mock.map((m) => ({ label: `Practice interview: ${m.role}`, value: `${m.score}/10`, source: "AI mock interview", verified: false })),
    ],
    gaps: [...(!commParts.length ? ["No communication assessment, written test or practice interview taken"] : []), ...(writing || mock.length ? ["AI marking is a guide, not an examiner's grade"] : []), "Spoken communication is only seen through practice interviews"],
  });

  // --- Digital literacy and teamwork: measured by their own tests.
  const dig = byCategory("DIGITAL_LITERACY");
  dims.push({ key: "digital", label: "Digital literacy", kind: dig.length ? "measured" : "none", score: mean(dig.map((r) => r.pct)), confidence: confidenceFor(dig.length), items: testItems(dig), gaps: dig.length ? (dig.length < 2 ? ["One test taken, so the score is a rough guide"] : []) : ["No digital literacy assessment has been taken"] });
  const team = inst("teamwork-leadership"), tw = instrumentByKey("teamwork-leadership")!;
  dims.push({
    key: "teamwork", label: "Teamwork and leadership", kind: team ? "measured" : "none", score: team ? mean(tw.scales.map((x) => team.result.scales[x.key].score)) : null, confidence: team ? "low" : "none",
    items: team ? tw.scales.map((x) => ({ label: x.label, value: team.result.scales[x.key].score, source: "Career test", verified: false })) : [],
    gaps: team ? ["Judgement in imagined situations, not observed behaviour"] : ["Teamwork and leadership scenarios not taken yet"],
  });

  // --- Professional development: learning, events, achievements and roadmap progress. System records where they exist, declared otherwise.
  const [learningSteps, eventsAttended, eventsRegistered, roadmap, achievements] = await Promise.all([
    db.learningProgress.count({ where: { member: { studentId } } }),
    db.eventRegistration.count({ where: { studentId, status: "ATTENDED" } }),
    db.eventRegistration.count({ where: { studentId, status: { in: ["REGISTERED", "ATTENDED"] } } }),
    db.studentRoadmap.findUnique({ where: { studentId }, select: { milestones: { where: { archivedAt: null, status: { not: "SKIPPED" } }, select: { status: true } } } }),
    Promise.resolve(sec("ACHIEVEMENTS")),
  ]);
  const roadmapTotal = roadmap?.milestones.length ?? 0, roadmapDone = roadmap?.milestones.filter((m) => m.status === "DONE").length ?? 0;
  const achievementList = listOf(achievements?.data, "achievements") as Record<string, unknown>[];
  const devItems: Item[] = [
    ...(learningSteps ? [{ label: "Learning programme steps completed", value: learningSteps, source: "Learning programmes", verified: true }] : []),
    ...(eventsRegistered ? [{ label: "Events", value: `${eventsAttended} attended of ${eventsRegistered} registered`, source: "Events", verified: true }] : []),
    ...(roadmapTotal ? [{ label: "Career roadmap progress", value: `${roadmapDone} of ${roadmapTotal} milestones done`, source: "Career roadmap", verified: true }] : []),
    ...achievementList.slice(0, 8).map((a) => ({ label: `Achievement: ${String(a.title ?? "")}`, value: [a.position, a.level].filter(Boolean).join(", ") || null, source: "ACHIEVEMENTS section", verified: !!achievements?.verified })),
    ...(certs.length ? [{ label: "Certifications listed", value: certs.length, source: "SKILLS section", verified: !!sk?.verified }] : []),
  ];
  const devSystem = !!(learningSteps || eventsRegistered || roadmapTotal);
  dims.push({
    key: "development", label: "Professional development", kind: devSystem ? "measured" : devItems.length ? "declared" : "none", score: null, confidence: devSystem ? "medium" : devItems.length ? "low" : "none",
    items: devItems,
    gaps: [...(!devItems.length ? ["No learning, events, achievements, certifications or roadmap progress recorded"] : []), ...(achievementList.length && !achievements?.verified ? ["Achievements are student-declared and not yet verified by staff"] : []), ...(!roadmapTotal ? ["The student has not opened their career roadmap yet"] : [])],
    note: "Shows activity, not a score: what the student has done to develop beyond their coursework.",
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
  const signals: Signals = { riasecRanking: riasecTest ? riasecTest.result.ranking : null, styleRanking: style ? style.result.ranking : null };
  return { signals, dimensions: dims, jobFit, personalityShared: share, context: { programme: st.program?.name ?? null, department: st.department.name, batch: st.batch.name, graduationYear: st.batch.endYear, profileStatus: st.onboardingStatus, academicsVerified: av, documents: docs } };
}

/** Changes when any score, item or job-fit result changes, so a stored AI reading can be recognised as out of date. */
export const evidenceHash = (e: Evidence) => createHash("sha256").update(JSON.stringify({ d: e.dimensions.map((x) => [x.key, x.score, x.items, x.gaps]), j: e.jobFit, a: e.context.academicsVerified })).digest("hex");
