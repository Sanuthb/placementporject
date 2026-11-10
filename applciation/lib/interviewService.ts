import { db } from "@/lib/db";
import { ApiError, notFound } from "@/lib/api/errors";
import type { StudentSession } from "@/lib/auth/student";
import { assignedTo, cleanFeedback, compareInterviews, deadlineOf, jdBrief, type InterviewType, type Turn } from "@/lib/interviewEngine";
import { interviewFeedback, type Config } from "@/lib/mockInterview";
import { notifyStudent } from "@/lib/notify";

type Row = NonNullable<Awaited<ReturnType<typeof db.mockInterview.findFirst>>>;

/** The interview's configuration, with the job brief when it was set up for a job. The JD is loaded by id from the interview row, which only an assignment can fill. */
export async function configOf(m: Row): Promise<Config> {
  const jd = m.jdId ? await db.jobDescription.findFirst({ where: { id: m.jdId, collegeId: m.collegeId }, select: { title: true, companyName: true, data: true } }) : null;
  return { role: m.role, topic: m.topic, type: m.type as InterviewType, mode: m.mode as "LEARNING" | "ASSESSMENT", difficulty: m.difficulty, language: m.language, brief: jd ? jdBrief(jd) : null };
}

export async function myInterview(me: StudentSession, id: string) {
  const m = await db.mockInterview.findFirst({ where: { id, studentId: me.studentId } });
  if (!m) throw notFound("Interview not found");
  return m;
}

/** Ends an interview: evaluates the answers given (a last unanswered question is left out), stores the report and tells the student. The status is claimed first so two finishes cannot both pay for an evaluation. */
export async function finishInterview(m: Row, turns: Turn[]) {
  const answered = turns.at(-1)?.role === "interviewer" ? turns.slice(0, -1) : turns;
  const claim = await db.mockInterview.updateMany({ where: { id: m.id, status: "IN_PROGRESS" }, data: { status: "FINISHING" } });
  if (claim.count === 0) throw new ApiError(409, "CONFLICT", "This interview is finished");
  try {
    const feedback = await interviewFeedback(await configOf(m), answered);
    await db.mockInterview.update({ where: { id: m.id }, data: { transcript: turns, status: "COMPLETED", feedback, completedAt: new Date() } });
    await notifyStudent(m.collegeId, m.studentId, { type: "interview.report", title: `Your interview report is ready: ${m.role}`, body: `Score ${feedback.score}/10`, link: "/student/prep" }).catch(() => undefined);
    return feedback;
  } catch (e) {
    await db.mockInterview.update({ where: { id: m.id }, data: { status: "IN_PROGRESS" } }); // let the student try again
    throw e;
  }
}

/** The report of a finished interview and how it compares with the previous finished one of the same type and role. */
export async function comparisonFor(m: Row) {
  const f = cleanFeedback(m.feedback);
  if (!f || m.status !== "COMPLETED") return null;
  const prev = await db.mockInterview.findFirst({ where: { studentId: m.studentId, status: "COMPLETED", type: m.type, id: { not: m.id }, completedAt: { lt: m.completedAt ?? new Date() } }, orderBy: { completedAt: "desc" }, select: { feedback: true, completedAt: true } });
  const p = prev ? cleanFeedback(prev.feedback) : null;
  return p ? { ...compareInterviews(f, p)!, previousDate: prev!.completedAt } : null;
}

export const deadlineFor = (m: Row) => (m.mode === "ASSESSMENT" ? deadlineOf(m.createdAt, m.durationMin) : null);

/** Assignments open to this student that are still current. */
export async function myAssignments(me: StudentSession) {
  const rows = await db.interviewAssignment.findMany({ where: { collegeId: me.collegeId, OR: [{ dueAt: null }, { dueAt: { gt: new Date() } }] }, orderBy: { createdAt: "desc" }, take: 100 });
  const mine = rows.filter((a) => assignedTo(a, me));
  const done = await db.mockInterview.groupBy({ by: ["assignmentId"], where: { studentId: me.studentId, assignmentId: { in: mine.map((a) => a.id) }, status: "COMPLETED" }, _count: true });
  const n = new Map(done.map((d) => [d.assignmentId, d._count]));
  return mine.map((a) => ({ id: a.id, title: a.title, type: a.type, mode: a.mode, difficulty: a.difficulty, durationMin: a.durationMin, language: a.language, role: a.role, topic: a.topic, dueAt: a.dueAt, completed: n.get(a.id) ?? 0 }));
}
