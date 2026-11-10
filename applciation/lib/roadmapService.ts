import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { listOf } from "@/lib/resume";
import { gatherEvidence } from "@/lib/intelligence/evidence";
import { recommend } from "@/lib/careerRecommendations";
import { AUTO, autoUpdates, generateRoadmap, progressOf, yearOfSemester, type Signals } from "@/lib/roadmap";
import { suggestMilestones, suggestRoles } from "@/lib/roadmapSuggestions";

type Tx = Prisma.TransactionClient | typeof db;
export type Actor = { actor: "STUDENT" | "MENTOR" | "STAFF" | "SYSTEM"; actorId?: string | null };

const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : []);
const hasData = (d: unknown) => !!d && typeof d === "object" && Object.keys(d as object).length > 0;

/** Where the student is in their programme: how many semesters it has and which one they are in. */
export async function programmeShape(studentId: string) {
  const st = await db.student.findUniqueOrThrow({ where: { id: studentId }, select: { program: { select: { name: true, durationYears: true, semesterCount: true } }, currentSemester: { select: { number: true, name: true } } } });
  const total = Math.max(1, st.program?.semesterCount ?? 4);
  return { programme: st.program?.name ?? null, years: Math.max(1, st.program?.durationYears ?? Math.ceil(total / 2)), totalSemesters: total, currentSemester: Math.min(total, Math.max(1, st.currentSemester?.number ?? 1)), currentSemesterName: st.currentSemester?.name ?? null };
}

export async function recordEvent(tx: Tx, roadmap: { id: string; collegeId: string }, a: Actor, action: string, detail: Record<string, unknown> = {}) {
  await tx.roadmapEvent.create({ data: { roadmapId: roadmap.id, collegeId: roadmap.collegeId, actor: a.actor, actorId: a.actorId ?? null, action, detail: detail as Prisma.InputJsonValue } });
}

/** The roadmap for a student, created from the programme's own length the first time it is needed. */
export async function ensureRoadmap(collegeId: string, studentId: string) {
  const existing = await db.studentRoadmap.findUnique({ where: { studentId } });
  if (existing) return existing;
  const { totalSemesters } = await programmeShape(studentId);
  try {
    return await db.$transaction(async (tx) => {
      const r = await tx.studentRoadmap.create({ data: { collegeId, studentId, totalSemesters } });
      await tx.roadmapMilestone.createMany({ data: generateRoadmap(totalSemesters).map((m) => ({ roadmapId: r.id, collegeId, key: m.key, semester: m.semester, phase: m.phase, category: m.category, title: m.title, description: m.description, auto: m.auto, source: "TEMPLATE", sortOrder: m.sortOrder })) });
      await recordEvent(tx, r, { actor: "SYSTEM" }, "roadmap.created", { totalSemesters });
      return r;
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return db.studentRoadmap.findUniqueOrThrow({ where: { studentId } }); // two tabs opened at once
    throw e;
  }
}

/** What the system knows about the student, as the signals the auto-tracking rules read. */
export async function gatherSignals(collegeId: string, studentId: string, targetRole: string | null): Promise<Signals> {
  const [st, sections, instruments, attempts, psych, mocks, steps, courses, projectWork, interns, events, apps, attend] = await Promise.all([
    db.student.findUniqueOrThrow({ where: { id: studentId }, select: { stage: true, onboardingStatus: true } }),
    db.studentSection.findMany({ where: { studentId }, select: { section: true, status: true, data: true, pendingData: true } }),
    db.instrumentAttempt.findMany({ where: { studentId }, select: { instrumentKey: true }, distinct: ["instrumentKey"] }),
    db.assessmentAttempt.findMany({ where: { studentId, status: { not: "IN_PROGRESS" }, schedule: { collegeId, isPractice: false } }, select: { schedule: { select: { paper: { select: { category: true } } } } } }),
    db.psychAttempt.count({ where: { studentId } }),
    db.mockInterview.count({ where: { studentId, status: "COMPLETED" } }),
    db.learningProgress.count({ where: { member: { studentId } } }),
    db.courseEnrolment.count({ where: { studentId, status: "COMPLETED" } }),
    db.projectMember.count({ where: { studentId, team: { status: { in: ["SUBMITTED", "EVALUATED"] } } } }),
    db.internship.count({ where: { studentId, status: "COMPLETED" } }),
    db.eventRegistration.count({ where: { studentId, status: { in: ["REGISTERED", "ATTENDED"] } } }),
    db.application.count({ where: { studentId } }),
    db.attendanceRecord.count({ where: { studentId, status: "PRESENT" } }),
  ]);
  const sec = (name: string) => sections.find((x) => x.section === name);
  const verified = (name: string) => sec(name)?.status === "VERIFIED";
  const cats = new Set(attempts.map((a) => a.schedule.paper.category as string));
  if (psych > 0) { cats.add("APTITUDE"); cats.add("PERSONALITY"); } // the built-in test covers both
  const proj = sec("PROJECTS");
  return {
    profileVerified: st.onboardingStatus === "VERIFIED" || st.stage === "VERIFIED" || st.stage === "ONBOARDED",
    resumeVerified: verified("RESUME"), skillsVerified: verified("SKILLS"), achievementsVerified: verified("ACHIEVEMENTS"),
    projectsListed: (proj ? listOf(hasData(proj.data) ? proj.data : proj.pendingData, "projects").length : 0) + projectWork,
    tests: instruments.map((i) => i.instrumentKey), categoriesTaken: [...cats],
    mockInterviews: mocks, learningStepsDone: steps + courses, internshipsCompleted: interns, eventsRegistered: events, applications: apps, driveAttendances: attend,
    targetRoleSet: !!targetRole?.trim(),
  };
}

/** Ticks off milestones the system's own data says are done. Records each as an event. Never undoes anything a person ticked. */
export async function refreshAuto(roadmap: { id: string; collegeId: string; studentId: string; targetRole: string | null }) {
  const [ms, signals] = await Promise.all([
    db.roadmapMilestone.findMany({ where: { roadmapId: roadmap.id, archivedAt: null } }),
    gatherSignals(roadmap.collegeId, roadmap.studentId, roadmap.targetRole),
  ]);
  const changed = autoUpdates(ms.map((m) => ({ ...m, archived: false })), signals);
  if (!changed.length) return 0;
  await db.$transaction(async (tx) => {
    const now = new Date();
    await tx.roadmapMilestone.updateMany({ where: { id: { in: changed.map((m) => m.id) }, status: { in: ["PLANNED", "IN_PROGRESS"] } }, data: { status: "DONE", completedAt: now, completedBy: "AUTO" } });
    for (const m of changed) await recordEvent(tx, roadmap, { actor: "SYSTEM" }, "milestone.auto_done", { milestoneId: m.id, title: m.title, rule: m.auto });
  });
  return changed.length;
}

/** The whole roadmap as the student (or someone reviewing it) sees it. `viewer` decides whether recommendations are worded to the student. */
export async function roadmapView(collegeId: string, studentId: string, viewer: "student" | "staff", opts: { create?: boolean } = {}) {
  // Only the student's own screen creates a roadmap. A mentor or staff member looking at a student who has not opened theirs creates nothing.
  const base = opts.create === false ? await db.studentRoadmap.findUnique({ where: { studentId } }) : await ensureRoadmap(collegeId, studentId);
  if (!base) return null;
  await refreshAuto(base);
  const [roadmap, shape] = await Promise.all([
    db.studentRoadmap.findUniqueOrThrow({ where: { id: base.id }, include: { milestones: { where: { archivedAt: null }, orderBy: [{ semester: "asc" }, { sortOrder: "asc" }] }, goals: { orderBy: { createdAt: "asc" } }, comments: { orderBy: { createdAt: "desc" }, take: 30 }, events: { orderBy: { createdAt: "desc" }, take: 40 } } }),
    programmeShape(studentId),
  ]);
  const progress = progressOf(roadmap.milestones.map((m) => ({ ...m, archived: false })), shape.currentSemester);
  const years = Array.from({ length: shape.years }, (_, i) => i + 1).map((year) => ({
    year, semesters: Array.from({ length: roadmap.totalSemesters }, (_, k) => k + 1).filter((s) => yearOfSemester(s, roadmap.totalSemesters, shape.years) === year).map((semester) => ({ semester, current: semester === shape.currentSemester, milestones: roadmap.milestones.filter((m) => m.semester === semester) })),
  }));

  // Suggestions come from the student's own assessment results; staff reading the roadmap see the same facts in third person.
  const [evidence, skills] = await Promise.all([gatherEvidence(collegeId, studentId, { asStudent: true }), db.studentSection.findFirst({ where: { studentId, section: "SKILLS" }, select: { data: true, pendingData: true } })]);
  const recs = recommend(evidence.dimensions, evidence.signals, viewer);
  const keys = roadmap.milestones.map((m) => m.key).filter((k): k is string => !!k);
  const all = await db.roadmapMilestone.findMany({ where: { roadmapId: roadmap.id, key: { startsWith: "rec:" } }, select: { key: true } });
  const suggestions = suggestMilestones(recs, [...keys, ...all.map((m) => m.key!)], shape.currentSemester, roadmap.totalSemesters);
  const skillData = (hasData(skills?.data) ? skills?.data : skills?.pendingData) as Record<string, unknown> | null;
  const roles = suggestRoles({ riasecRanking: evidence.signals?.riasecRanking ?? null, preferredRoles: strs(skillData?.preferredRoles) });

  return {
    roadmap: { id: roadmap.id, targetRole: roadmap.targetRole, careerGoal: roadmap.careerGoal, totalSemesters: roadmap.totalSemesters, createdAt: roadmap.createdAt, updatedAt: roadmap.updatedAt },
    programme: shape, progress: { ...progress, overdue: progress.overdue.map((m) => m.id), next: progress.next.map((m) => m.id) },
    years, goals: roadmap.goals, comments: roadmap.comments, history: roadmap.events,
    autoRules: Object.fromEntries(Object.values(AUTO).map((r) => [r.id, r.how])), suggestions, roles,
  };
}
export type RoadmapView = NonNullable<Awaited<ReturnType<typeof roadmapView>>>;

/** The student's own view: always has a roadmap, creating it on first use. */
export async function ownRoadmap(collegeId: string, studentId: string): Promise<RoadmapView> {
  return (await roadmapView(collegeId, studentId, "student"))!;
}
