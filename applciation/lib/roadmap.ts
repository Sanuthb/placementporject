/**
 * Career roadmap engine. Pure (no database), so the rules are testable and the same everywhere.
 *
 * The SRS describes a four-year plan with a theme per year (discover, build, specialise, prepare). Programmes differ in length (an MCA is
 * two years), so the roadmap is built from the programme's own number of semesters: the four themes are spread across however many
 * semesters there are, and the milestones that belong to a theme are placed within it.
 */
export const PHASES = [
  { key: "DISCOVER", label: "Discover", summary: "Discover your interests, check your abilities and build foundations." },
  { key: "BUILD", label: "Build", summary: "Develop technical skills, communication and practical experience." },
  { key: "SPECIALISE", label: "Specialise", summary: "Gain industry exposure, complete internships and develop a specialisation." },
  { key: "PREPARE", label: "Prepare", summary: "Prepare for recruitment, complete assessments and take part in placement activities." },
] as const;
export type Phase = (typeof PHASES)[number]["key"];
export const phaseLabel = (p: string) => PHASES.find((x) => x.key === p)?.label ?? p;

export const CATEGORIES = ["PROFILE", "ASSESSMENT", "LEARNING", "SKILL", "PROJECT", "INTERNSHIP", "ACHIEVEMENT", "PLACEMENT", "PERSONAL"] as const;
export type Category = (typeof CATEGORIES)[number];
export const categoryName = (c: string) => ({ PROFILE: "Profile", ASSESSMENT: "Assessment", LEARNING: "Learning", SKILL: "Skill", PROJECT: "Project", INTERNSHIP: "Internship", ACHIEVEMENT: "Achievement", PLACEMENT: "Placement", PERSONAL: "Personal goal" } as Record<string, string>)[c] ?? c;

/** What the system knows about a student, used to tick milestones off without anyone having to say so. */
export type Signals = {
  profileVerified: boolean;
  resumeVerified: boolean;
  skillsVerified: boolean;
  projectsListed: number;
  achievementsVerified: boolean;
  tests: string[];
  categoriesTaken: string[];
  mockInterviews: number;
  learningStepsDone: number;
  internshipsCompleted: number;
  eventsRegistered: number;
  applications: number;
  driveAttendances: number;
  targetRoleSet: boolean;
};
export const NO_SIGNALS: Signals = { profileVerified: false, resumeVerified: false, skillsVerified: false, projectsListed: 0, achievementsVerified: false, tests: [], categoriesTaken: [], mockInterviews: 0, learningStepsDone: 0, internshipsCompleted: 0, eventsRegistered: 0, applications: 0, driveAttendances: 0, targetRoleSet: false };

/** A rule that decides, from signals alone, whether a milestone is done. Each has a plain-words description shown to the student. */
export type AutoRule = { id: string; how: string; met: (s: Signals) => boolean };
const rule = (id: string, how: string, met: (s: Signals) => boolean): AutoRule => ({ id, how, met });
const took = (c: string) => (s: Signals) => s.categoriesTaken.includes(c);
export const AUTO: Record<string, AutoRule> = {
  profile: rule("profile", "Done when staff have verified your profile.", (s) => s.profileVerified),
  riasec: rule("riasec", "Done when you have taken the career interests test.", (s) => s.tests.includes("riasec")),
  style: rule("style", "Done when you have taken the behavioural style test.", (s) => s.tests.includes("behavioural-style")),
  aptitude: rule("aptitude", "Done when you have taken an aptitude assessment.", took("APTITUDE")),
  digital: rule("digital", "Done when you have taken the digital literacy assessment.", took("DIGITAL_LITERACY")),
  technical: rule("technical", "Done when you have taken a technical assessment.", took("TECHNICAL")),
  communication: rule("communication", "Done when you have taken a communication test or the written communication test.", (s) => s.categoriesTaken.includes("COMMUNICATION") || s.tests.includes("communication-writing")),
  teamwork: rule("teamwork", "Done when you have taken the teamwork and leadership scenarios.", (s) => s.tests.includes("teamwork-leadership")),
  mock1: rule("mock1", "Done when you have completed a practice interview.", (s) => s.mockInterviews >= 1),
  mock3: rule("mock3", "Done when you have completed three practice interviews.", (s) => s.mockInterviews >= 3),
  learning: rule("learning", "Done when you finish a course or complete a step in a learning programme.", (s) => s.learningStepsDone >= 1),
  project: rule("project", "Done when a project is listed in your profile.", (s) => s.projectsListed >= 1),
  projects2: rule("projects2", "Done when two projects are listed in your profile.", (s) => s.projectsListed >= 2),
  internship: rule("internship", "Done when an internship of yours is marked completed.", (s) => s.internshipsCompleted >= 1),
  achievement: rule("achievement", "Done when staff have verified your achievements.", (s) => s.achievementsVerified),
  event: rule("event", "Done when you have registered for an event.", (s) => s.eventsRegistered >= 1),
  role: rule("role", "Done when you choose a target role below.", (s) => s.targetRoleSet),
  resume: rule("resume", "Done when staff have verified your resume.", (s) => s.resumeVerified),
  apply: rule("apply", "Done when you have applied to a drive.", (s) => s.applications >= 1),
  attend: rule("attend", "Done when you have attended a drive.", (s) => s.driveAttendances >= 1),
};

/** `where`: first = early in the phase, last = late in the phase, any = spread. `auto` names a rule in AUTO; without one it is ticked by hand. */
export type LibraryItem = { key: string; phase: Phase; category: Category; title: string; description: string; where: "first" | "last" | "any"; auto?: keyof typeof AUTO };
const L = (key: string, phase: Phase, category: Category, title: string, description: string, where: LibraryItem["where"], auto?: keyof typeof AUTO): LibraryItem => ({ key, phase, category, title, description, where, auto });
export const LIBRARY: LibraryItem[] = [
  L("d-profile", "DISCOVER", "PROFILE", "Complete and verify your profile", "Fill in every section of your profile, with documents, so staff can verify it.", "first", "profile"),
  L("d-riasec", "DISCOVER", "ASSESSMENT", "Take the career interests test", "Find out which kinds of work you would enjoy most.", "first", "riasec"),
  L("d-style", "DISCOVER", "ASSESSMENT", "Take the behavioural style test", "See how you tend to approach work and people.", "any", "style"),
  L("d-aptitude", "DISCOVER", "ASSESSMENT", "Take an aptitude assessment", "Check your quantitative, logical and verbal reasoning.", "any", "aptitude"),
  L("d-digital", "DISCOVER", "ASSESSMENT", "Take the digital literacy assessment", "Check the everyday digital skills employers expect.", "any", "digital"),
  L("d-role", "DISCOVER", "PERSONAL", "Choose a target role", "Pick the role you are aiming for. You can change it later.", "last", "role"),
  L("d-event", "DISCOVER", "PERSONAL", "Take part in a college event", "Join a club, contest or workshop to meet people and try new things.", "last", "event"),
  L("b-technical", "BUILD", "ASSESSMENT", "Take a technical assessment", "Measure your technical knowledge and find the gaps to work on.", "first", "technical"),
  L("b-communication", "BUILD", "ASSESSMENT", "Take a communication test", "Check your workplace writing and communication.", "any", "communication"),
  L("b-learning", "BUILD", "LEARNING", "Finish a course or a learning programme step", "Take a course or programme your college offers.", "any", "learning"),
  L("b-skill", "BUILD", "SKILL", "Close your biggest skill gap", "Practise the area your assessments show as weakest, then retake the test.", "last"),
  L("b-project", "BUILD", "PROJECT", "Build your first project", "Build something real, and list it in your profile with the tools you used.", "last", "project"),
  L("b-cert", "BUILD", "SKILL", "Earn a certification or finish a course", "Get a certificate that backs up a skill you want to show.", "any"),
  L("b-mock1", "BUILD", "PLACEMENT", "Do your first practice interview", "Practise answering questions out loud with the AI interviewer.", "any", "mock1"),
  L("s-internship", "SPECIALISE", "INTERNSHIP", "Complete an internship", "Get industry experience and have it recorded and evaluated.", "any", "internship"),
  L("s-projects", "SPECIALISE", "PROJECT", "Have two projects in your profile", "A second, deeper project in your chosen direction.", "last", "projects2"),
  L("s-teamwork", "SPECIALISE", "ASSESSMENT", "Take the teamwork and leadership scenarios", "See how you handle common team situations.", "first", "teamwork"),
  L("s-achievements", "SPECIALISE", "ACHIEVEMENT", "Record your achievements", "Add awards, competitions and certifications, with proof, for staff to verify.", "any", "achievement"),
  L("s-specialise", "SPECIALISE", "SKILL", "Pick a specialisation and go deeper", "Choose one area and build clearly above-average skill in it.", "first"),
  L("s-industry", "SPECIALISE", "PLACEMENT", "Attend an industry talk or visit", "Hear from people working in the field you are aiming for.", "any"),
  L("p-resume", "PREPARE", "PROFILE", "Get your resume verified", "Finish your resume and have staff verify it before drives open.", "first", "resume"),
  L("p-mock3", "PREPARE", "PLACEMENT", "Complete three practice interviews", "Repeat practice interviews until you are comfortable.", "any", "mock3"),
  L("p-retake", "PREPARE", "ASSESSMENT", "Retake the assessments you did poorly in", "Show your progress, where your college allows a retake.", "any"),
  L("p-apply", "PREPARE", "PLACEMENT", "Apply to a placement drive", "Apply to drives you are eligible for.", "last", "apply"),
  L("p-attend", "PREPARE", "PLACEMENT", "Attend a placement drive", "Take part in a drive: tests, group discussions and interviews.", "last", "attend"),
];

/** Which phase a semester belongs to: the programme's semesters are divided into four equal-as-possible parts. */
export function phaseOfSemester(semester: number, total: number): Phase {
  const t = Math.max(1, total), s = Math.min(Math.max(1, semester), t);
  return PHASES[Math.min(3, Math.floor(((s - 1) / t) * 4))].key;
}
/** The semesters that make up a phase. With fewer than four semesters some phases share a semester. */
export function semestersOfPhase(phase: Phase, total: number): number[] {
  const out: number[] = [];
  for (let s = 1; s <= Math.max(1, total); s++) if (phaseOfSemester(s, total) === phase) out.push(s);
  if (out.length) return out;
  // Very short programmes: the phase borrows the nearest semester so it still has somewhere to sit.
  const idx = PHASES.findIndex((p) => p.key === phase);
  return [Math.min(Math.max(1, total), Math.max(1, Math.round(((idx + 0.5) / 4) * total)))];
}
/** Academic year (1-based) a semester falls in, from the programme's semesters per year. */
export const yearOfSemester = (semester: number, total: number, years: number) => Math.min(Math.max(1, years), Math.ceil(semester / Math.max(1, total / Math.max(1, years))));

export type PlannedMilestone = { key: string; semester: number; phase: Phase; category: Category; title: string; description: string; auto: string | null; sortOrder: number };

/** The starting roadmap for a programme of `total` semesters. Deterministic: the same programme always gives the same plan. */
export function generateRoadmap(total: number): PlannedMilestone[] {
  const out: PlannedMilestone[] = [];
  for (const ph of PHASES) {
    const sems = semestersOfPhase(ph.key, total);
    const items = LIBRARY.filter((l) => l.phase === ph.key);
    items.forEach((it, i) => {
      const semester = it.where === "first" ? sems[0] : it.where === "last" ? sems[sems.length - 1] : sems[Math.min(sems.length - 1, Math.floor((i / Math.max(1, items.length)) * sems.length))];
      out.push({ key: it.key, semester, phase: ph.key, category: it.category, title: it.title, description: it.description, auto: it.auto ?? null, sortOrder: 0 });
    });
  }
  out.sort((a, b) => a.semester - b.semester || PHASES.findIndex((p) => p.key === a.phase) - PHASES.findIndex((p) => p.key === b.phase) || a.key.localeCompare(b.key));
  return out.map((m, i) => ({ ...m, sortOrder: i }));
}

export type MilestoneLike = { id?: string; semester: number; status: string; archived?: boolean; phase?: string; title?: string; source?: string };
const live = <T extends MilestoneLike>(ms: T[]) => ms.filter((m) => !m.archived && m.status !== "SKIPPED");

/** Overall and per-phase progress, what is overdue, and what to do next. Skipped and removed milestones do not count for or against. */
export function progressOf<T extends MilestoneLike>(milestones: T[], currentSemester: number) {
  const ms = live(milestones);
  const done = ms.filter((m) => m.status === "DONE");
  const overdue = ms.filter((m) => m.status !== "DONE" && m.semester < currentSemester);
  const upcoming = ms.filter((m) => m.status !== "DONE" && m.semester >= currentSemester).sort((a, b) => a.semester - b.semester);
  const byPhase = PHASES.map((p) => { const x = ms.filter((m) => m.phase === p.key); return { phase: p.key, total: x.length, done: x.filter((m) => m.status === "DONE").length }; });
  return { total: ms.length, done: done.length, percent: ms.length ? Math.round((done.length / ms.length) * 100) : 0, overdue, next: upcoming.slice(0, 3), byPhase, onTrack: overdue.length === 0 };
}

/** Marks milestones done when the system's own data says so. Returns the ones that changed. Never undoes a milestone the student or mentor ticked. */
export function autoUpdates<T extends { id: string; auto: string | null; status: string; archived?: boolean }>(milestones: T[], signals: Signals): T[] {
  return milestones.filter((m) => !m.archived && m.auto && m.status !== "DONE" && m.status !== "SKIPPED" && AUTO[m.auto]?.met(signals));
}
