import { db } from "@/lib/db";
import { deliverPending } from "@/lib/dispatch";
import { assignedTo } from "@/lib/interviewEngine";
import { planReminders, type ReminderFacts } from "@/lib/notifyRules";
import { scheduleOpenTo } from "@/lib/studentAssessments";

const HOUR = 3_600_000;

/**
 * Finds what is due soon (tests opening or closing, course assignments, preparation tasks, assigned interviews and discussions), tells each student once per item, then sends the
 * new notifications to the other channels students opted in to. Running it every hour or so is safe: each reminder has a stable link that is checked before it is sent.
 */
export async function sendReminders(collegeId: string, now = new Date()) {
  const [students, schedules, lessons, items, ia, da] = await Promise.all([
    db.student.findMany({ where: { collegeId, isActive: true }, select: { id: true, departmentId: true, batchId: true }, take: 20_000 }),
    db.assessmentSchedule.findMany({ where: { collegeId, endsAt: { gt: now }, startsAt: { lte: new Date(now.getTime() + 24 * HOUR) }, isPractice: false }, select: { id: true, title: true, startsAt: true, endsAt: true, targetStudentIds: true, targetDepartmentIds: true, targetBatchIds: true, attempts: { select: { studentId: true } } }, take: 200 }),
    db.courseLesson.findMany({ where: { collegeId, type: "ASSIGNMENT", dueAt: { gt: now, lte: new Date(now.getTime() + 48 * HOUR) }, course: { status: "PUBLISHED" } }, select: { id: true, title: true, dueAt: true, course: { select: { title: true, enrolments: { where: { status: "ENROLLED" }, select: { id: true, studentId: true, submissions: { select: { lessonId: true } } } } } } }, take: 300 }),
    db.campaignPlanItem.findMany({ where: { status: "PENDING", dueAt: { gt: new Date(now.getTime() - 12 * HOUR), lte: new Date(now.getTime() + 24 * HOUR) }, campaign: { collegeId, status: "ACTIVE" }, member: { status: "ACCEPTED" } }, select: { id: true, title: true, dueAt: true, member: { select: { studentId: true } }, campaign: { select: { jobRole: true, company: true } } }, take: 5000 }),
    db.interviewAssignment.findMany({ where: { collegeId, dueAt: { gt: now, lte: new Date(now.getTime() + 48 * HOUR) } }, select: { id: true, title: true, dueAt: true, targetStudentIds: true, targetDepartmentIds: true, targetBatchIds: true, interviews: { where: { status: "COMPLETED" }, select: { studentId: true } } } }),
    db.discussionAssignment.findMany({ where: { collegeId, dueAt: { gt: now, lte: new Date(now.getTime() + 48 * HOUR) } }, select: { id: true, title: true, dueAt: true, targetDepartmentIds: true, targetBatchIds: true, sessions: { where: { status: "COMPLETED" }, select: { studentId: true } } } }),
  ]);
  const facts: ReminderFacts = { now, tests: [], assignments: [], planItems: [], assigned: [] };
  for (const sc of schedules) { const taken = new Set(sc.attempts.map((a) => a.studentId)); for (const st of students) if (scheduleOpenTo(sc, { studentId: st.id, departmentId: st.departmentId, batchId: st.batchId })) facts.tests.push({ studentId: st.id, scheduleId: sc.id, title: sc.title, startsAt: sc.startsAt, endsAt: sc.endsAt, taken: taken.has(st.id) }); }
  for (const l of lessons) for (const e of l.course.enrolments) facts.assignments.push({ studentId: e.studentId, lessonId: l.id, courseTitle: l.course.title, title: l.title, dueAt: l.dueAt!, submitted: e.submissions.some((x) => x.lessonId === l.id) });
  for (const i of items) facts.planItems.push({ studentId: i.member.studentId, itemId: i.id, title: i.title, dueAt: i.dueAt, done: false, campaign: `${i.campaign.jobRole} at ${i.campaign.company}` });
  for (const a of ia) { const done = new Set(a.interviews.map((x) => x.studentId)); for (const st of students) if (assignedTo(a, { studentId: st.id, departmentId: st.departmentId, batchId: st.batchId })) facts.assigned.push({ studentId: st.id, kind: "interview", assignmentId: a.id, title: a.title, dueAt: a.dueAt!, done: done.has(st.id) }); }
  for (const a of da) { const done = new Set(a.sessions.map((x) => x.studentId)); for (const st of students) if (assignedTo({ ...a, targetStudentIds: [] }, { studentId: st.id, departmentId: st.departmentId, batchId: st.batchId })) facts.assigned.push({ studentId: st.id, kind: "discussion", assignmentId: a.id, title: a.title, dueAt: a.dueAt!, done: done.has(st.id) }); }

  const wanted = planReminders(facts);
  let reminded = 0;
  if (wanted.length) {
    const have = await db.notification.findMany({ where: { collegeId, type: { in: [...new Set(wanted.map((w) => w.type))] }, link: { in: wanted.map((w) => w.link) } }, select: { studentId: true, link: true } });
    const sent = new Set(have.map((h) => `${h.studentId}|${h.link}`));
    const fresh = wanted.filter((w) => !sent.has(`${w.studentId}|${w.link}`));
    if (fresh.length) await db.notification.createMany({ data: fresh.map((w) => ({ collegeId, studentId: w.studentId, type: w.type, title: w.title, body: w.body, link: w.link })) });
    reminded = fresh.length;
  }
  const { delivered } = await deliverPending(collegeId, 6, now);
  return { reminded, delivered };
}
