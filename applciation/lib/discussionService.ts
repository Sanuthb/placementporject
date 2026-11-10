import { db } from "@/lib/db";
import { ApiError, notFound } from "@/lib/api/errors";
import type { StudentSession } from "@/lib/auth/student";
import { assignedTo } from "@/lib/interviewEngine";
import { KIND_LABEL, awaitingStudent, cleanEvaluation, compareSessions, contributionTarget, deadlineOf, isExpired, nextSpeakers, participationStats, pickParticipants, studentTurns, type Kind, type Participant, type Turn } from "@/lib/discussionEngine";
import { evaluateSession, openingPoint, replies, type Config } from "@/lib/discussionAi";
import { notifyStudent } from "@/lib/notify";

type Row = NonNullable<Awaited<ReturnType<typeof db.discussionSession.findFirst>>>;

export const configOf = (m: Pick<Row, "kind" | "topic" | "stance" | "difficulty" | "language" | "participants">): Config => ({ kind: m.kind as Kind, topic: m.topic, stance: m.stance, difficulty: m.difficulty, language: m.language, participants: m.participants as Participant[] });

export async function mySession(me: StudentSession, id: string) {
  const m = await db.discussionSession.findFirst({ where: { id, studentId: me.studentId } });
  if (!m) throw notFound("Session not found");
  return m;
}

/** The line that opens a session. A group discussion is opened by an AI participant with a point of view; a debate and a presentation by a fixed moderator line (no AI call needed). */
async function opening(kind: Kind, cfg: Config, durationMin: number): Promise<Turn> {
  if (kind === "GD") return openingPoint(cfg);
  if (kind === "DEBATE") return { role: "ai", speaker: "Moderator", text: `The motion: ${cfg.topic}\n\nYou are arguing ${cfg.stance === "AGAINST" ? "against" : "for"} it. ${cfg.participants[0].name} will oppose you. Make your opening argument.` };
  return { role: "ai", speaker: "Moderator", text: `Topic: ${cfg.topic}\n\nPresent to the audience in your own words (about ${Math.max(1, Math.round(durationMin / 4))} to ${Math.max(2, Math.round(durationMin / 2))} minutes of speaking). Afterwards ${cfg.participants[0].name} will ask you questions.` };
}

export type StartInput = { kind: Kind; topic: string; stance?: "FOR" | "AGAINST"; difficulty: string; language: string; durationMin: number; participants?: number; assignmentId?: string | null; voiceConsent: boolean };
export async function startSession(me: StudentSession, i: StartInput) {
  const participants = pickParticipants(i.kind, i.participants ?? 3);
  const stance = i.kind === "DEBATE" ? i.stance ?? "FOR" : null;
  const cfg: Config = { kind: i.kind, topic: i.topic, stance, difficulty: i.difficulty, language: i.language, participants };
  const first = await opening(i.kind, cfg, i.durationMin);
  return db.discussionSession.create({ data: { collegeId: me.collegeId, studentId: me.studentId, kind: i.kind, topic: i.topic, stance, difficulty: i.difficulty, language: i.language, durationMin: i.durationMin, contributionCount: contributionTarget(i.kind, i.durationMin), participants, assignmentId: i.assignmentId ?? null, voiceConsentAt: i.voiceConsent ? new Date() : null, transcript: [first] }, select: { id: true } });
}

/** Ends a session: evaluates it, stores the report and tells the student. The status is claimed first so two finishes cannot both pay for an evaluation; if the evaluation fails the session goes back to in progress. */
export async function finishSession(m: Row, turns: Turn[]) {
  const claim = await db.discussionSession.updateMany({ where: { id: m.id, status: "IN_PROGRESS" }, data: { status: "FINISHING" } });
  if (claim.count === 0) throw new ApiError(409, "CONFLICT", "This session is finished");
  try {
    const ev = await evaluateSession(configOf(m), turns);
    await db.discussionSession.update({ where: { id: m.id }, data: { transcript: turns, status: "COMPLETED", feedback: ev, completedAt: new Date() } });
    await notifyStudent(m.collegeId, m.studentId, { type: "discussion.report", title: `Your ${KIND_LABEL[m.kind as Kind].toLowerCase()} report is ready`, body: `Score ${ev.score}/10`, link: "/student/prep" }).catch(() => undefined);
    return ev;
  } catch (e) {
    await db.discussionSession.update({ where: { id: m.id }, data: { status: "IN_PROGRESS" } });
    throw e;
  }
}

/** The student's next contribution. Returns the AI participants' replies, or the evaluation once the last contribution is in or time has run out. */
export async function contribute(me: StudentSession, id: string, text: string, voice: boolean) {
  const m = await mySession(me, id);
  if (m.status !== "IN_PROGRESS") throw new ApiError(409, "CONFLICT", "This session is finished");
  const before = m.transcript as Turn[];
  if (!awaitingStudent(before)) throw new ApiError(409, "CONFLICT", "Wait for the others to finish");
  if (isExpired(m.createdAt, m.durationMin)) {
    if (!studentTurns(before).length) throw new ApiError(409, "TIME_UP", "The time for this session has run out");
    return { done: true, expired: true, evaluation: await finishSession(m, before) };
  }
  const kind = m.kind as Kind, first = !studentTurns(before).length;
  const turns: Turn[] = [...before, { role: "student", speaker: "You", text, ...(voice ? { voice: true } : {}), ...(kind === "PRESENTATION" ? { kind: first ? "presentation" as const : "answer" as const } : {}) }];
  if (voice && !m.voiceUsed) await db.discussionSession.update({ where: { id }, data: { voiceUsed: true } });
  if (studentTurns(turns).length >= m.contributionCount) {
    await db.discussionSession.update({ where: { id }, data: { transcript: turns } });
    return { done: true, evaluation: await finishSession(m, turns) };
  }
  const cfg = configOf(m);
  const said = await replies(cfg, turns, nextSpeakers(turns, cfg.participants, kind === "GD" ? 2 : 1));
  await db.discussionSession.update({ where: { id }, data: { transcript: [...turns, ...said] } });
  return { done: false, replies: said };
}

export async function endEarly(me: StudentSession, id: string) {
  const m = await mySession(me, id);
  if (m.status !== "IN_PROGRESS") throw new ApiError(409, "CONFLICT", "This session is finished");
  const turns = m.transcript as Turn[];
  if (!studentTurns(turns).length) throw new ApiError(409, "CONFLICT", "Say something first");
  return finishSession(m, turns);
}

/** The report of a finished session and how it compares with the previous one of the same kind. */
export async function comparisonFor(m: Row) {
  const f = cleanEvaluation(m.feedback, m.kind as Kind);
  if (!f || m.status !== "COMPLETED") return null;
  const prev = await db.discussionSession.findFirst({ where: { studentId: m.studentId, status: "COMPLETED", kind: m.kind, id: { not: m.id }, completedAt: { lt: m.completedAt ?? new Date() } }, orderBy: { completedAt: "desc" }, select: { feedback: true } });
  const p = prev ? cleanEvaluation(prev.feedback, m.kind as Kind) : null;
  return p ? compareSessions(f, p) : null;
}

export const view = (m: Row) => ({
  id: m.id, kind: m.kind, topic: m.topic, stance: m.stance, difficulty: m.difficulty, language: m.language, durationMin: m.durationMin, participants: m.participants, status: m.status === "FINISHING" ? "IN_PROGRESS" : m.status,
  transcript: m.transcript, evaluation: cleanEvaluation(m.feedback, m.kind as Kind), stats: participationStats(m.transcript as Turn[]), createdAt: m.createdAt, completedAt: m.completedAt,
  deadline: m.status === "IN_PROGRESS" || m.status === "FINISHING" ? deadlineOf(m.createdAt, m.durationMin) : null, contributionCount: m.contributionCount, sharedWithStaff: !!m.assignmentId, voiceConsent: !!m.voiceConsentAt, voiceUsed: m.voiceUsed,
});

export async function myAssignments(me: StudentSession) {
  const rows = await db.discussionAssignment.findMany({ where: { collegeId: me.collegeId, OR: [{ dueAt: null }, { dueAt: { gt: new Date() } }] }, orderBy: { createdAt: "desc" }, take: 100 });
  const mine = rows.filter((a) => assignedTo({ ...a, targetStudentIds: [] }, me));
  const done = await db.discussionSession.groupBy({ by: ["assignmentId"], where: { studentId: me.studentId, assignmentId: { in: mine.map((a) => a.id) }, status: "COMPLETED" }, _count: true });
  const n = new Map(done.map((d) => [d.assignmentId, d._count]));
  return mine.map((a) => ({ id: a.id, title: a.title, kind: a.kind, topic: a.topic, difficulty: a.difficulty, language: a.language, durationMin: a.durationMin, dueAt: a.dueAt, completed: n.get(a.id) ?? 0 }));
}
