import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { notFound } from "@/lib/api/errors";
import type { StudentSession } from "@/lib/auth/student";
import { assignedTo } from "@/lib/interviewEngine";
import type { CalEvent } from "@/lib/notifyRules";
import { scheduleOpenTo } from "@/lib/studentAssessments";

export type StudentEvent = CalEvent & { kind: string; link: string | null };
const DAY = 86_400_000;
const none = (a: string[], v: string) => !a.length || a.includes(v);

/** Everything with a date that a student should see in a calendar: drive dates and deadlines, rounds, interview slots, tests, preparation tasks, course assignments, assigned interviews and discussions, and events they registered for. */
export async function studentEvents(me: StudentSession, now = new Date()): Promise<StudentEvent[]> {
  const from = new Date(now.getTime() - DAY), to = new Date(now.getTime() + 120 * DAY);
  const [apps, open, schedules, items, lessons, ia, da, regs] = await Promise.all([
    db.application.findMany({ where: { studentId: me.studentId, status: { in: ["APPLIED", "SHORTLISTED", "ON_HOLD"] } }, select: { drive: { select: { id: true, role: true, driveDate: true, venue: true, company: { select: { name: true } }, rounds: { where: { scheduledAt: { gte: from, lte: to } }, select: { id: true, order: true, type: true, name: true, scheduledAt: true, venue: true } } } }, slots: { where: { status: "SCHEDULED", startsAt: { gte: from, lte: to } }, select: { id: true, startsAt: true, endsAt: true, panel: { select: { name: true, room: true } } } } }, take: 100 }),
    db.drive.findMany({ where: { collegeId: me.collegeId, status: "PUBLISHED", applicationDeadline: { gte: now, lte: to } }, select: { id: true, role: true, applicationDeadline: true, departmentIds: true, batchIds: true, company: { select: { name: true } } }, take: 100 }),
    db.assessmentSchedule.findMany({ where: { collegeId: me.collegeId, endsAt: { gte: now }, startsAt: { lte: to } }, select: { id: true, title: true, startsAt: true, endsAt: true, isPractice: true, targetStudentIds: true, targetDepartmentIds: true, targetBatchIds: true }, take: 200 }),
    db.campaignPlanItem.findMany({ where: { status: "PENDING", dueAt: { gte: from, lte: to }, member: { studentId: me.studentId, status: "ACCEPTED" }, campaign: { collegeId: me.collegeId, status: "ACTIVE" } }, select: { id: true, title: true, dueAt: true, campaign: { select: { jobRole: true, company: true } } }, take: 200 }),
    db.courseLesson.findMany({ where: { collegeId: me.collegeId, type: "ASSIGNMENT", dueAt: { gte: now, lte: to }, course: { enrolments: { some: { studentId: me.studentId, status: "ENROLLED" } } } }, select: { id: true, title: true, dueAt: true, course: { select: { title: true } } }, take: 100 }),
    db.interviewAssignment.findMany({ where: { collegeId: me.collegeId, dueAt: { gte: now, lte: to } }, select: { id: true, title: true, dueAt: true, targetStudentIds: true, targetDepartmentIds: true, targetBatchIds: true }, take: 50 }),
    db.discussionAssignment.findMany({ where: { collegeId: me.collegeId, dueAt: { gte: now, lte: to } }, select: { id: true, title: true, dueAt: true, targetDepartmentIds: true, targetBatchIds: true }, take: 50 }),
    db.eventRegistration.findMany({ where: { studentId: me.studentId, status: "REGISTERED", event: { startsAt: { gte: from, lte: to }, status: "PUBLISHED" } }, select: { event: { select: { id: true, title: true, startsAt: true, endsAt: true, venue: true, joinUrl: true } } }, take: 50 }),
  ]);
  const out: StudentEvent[] = [];
  const applied = new Set(apps.map((a) => a.drive.id));
  for (const a of apps) {
    const d = a.drive, who = `${d.company.name}: ${d.role}`;
    out.push({ uid: `drive-${d.id}`, kind: "drive", title: `Drive: ${who}`, start: d.driveDate, place: d.venue, link: "/student/applications" });
    for (const r of d.rounds) out.push({ uid: `round-${r.id}`, kind: "round", title: `${who}: ${r.name ?? `round ${r.order}`}`, start: r.scheduledAt!, place: r.venue, link: "/student/applications" });
    for (const s of a.slots) out.push({ uid: `slot-${s.id}`, kind: "interview", title: `Interview: ${who}`, start: s.startsAt, end: s.endsAt, place: s.panel ? `${s.panel.name}${s.panel.room ? `, ${s.panel.room}` : ""}` : null, link: "/student/applications" });
  }
  for (const d of open) if (!applied.has(d.id) && none(d.departmentIds, me.departmentId) && none(d.batchIds, me.batchId)) out.push({ uid: `deadline-${d.id}`, kind: "deadline", title: `Apply by today: ${d.company.name}, ${d.role}`, start: d.applicationDeadline, allDay: true, link: `/student/drives/${d.id}` });
  for (const s of schedules) if (!s.isPractice && scheduleOpenTo(s, me)) out.push({ uid: `test-${s.id}`, kind: "test", title: `Test: ${s.title}`, start: s.startsAt, end: s.endsAt, description: `Open from the start time until ${s.endsAt.toISOString()}`, link: `/student/assessments/${s.id}` });
  for (const i of items) out.push({ uid: `prep-${i.id}`, kind: "preparation", title: `Preparation: ${i.title}`, start: i.dueAt, allDay: true, description: `${i.campaign.jobRole} at ${i.campaign.company}`, link: "/student/campaigns" });
  for (const l of lessons) out.push({ uid: `lesson-${l.id}`, kind: "course", title: `Assignment due: ${l.title}`, start: l.dueAt!, allDay: true, description: l.course.title, link: "/student/courses" });
  for (const a of ia) if (assignedTo(a, me)) out.push({ uid: `ia-${a.id}`, kind: "interview", title: `Mock interview due: ${a.title}`, start: a.dueAt!, allDay: true, link: "/student/prep" });
  for (const a of da) if (assignedTo({ ...a, targetStudentIds: [] }, me)) out.push({ uid: `da-${a.id}`, kind: "discussion", title: `Discussion practice due: ${a.title}`, start: a.dueAt!, allDay: true, link: "/student/prep" });
  for (const r of regs) out.push({ uid: `event-${r.event.id}`, kind: "event", title: r.event.title, start: r.event.startsAt, end: r.event.endsAt, place: r.event.venue ?? r.event.joinUrl, link: "/student/events" });
  return out.sort((a, b) => +a.start - +b.start);
}

const hash = (t: string) => createHash("sha256").update(t).digest("hex");
/** Makes (or replaces) the student's private calendar link. The secret is returned once; only its hash is kept. */
export async function rotateFeed(me: StudentSession) {
  const token = randomBytes(32).toString("base64url");
  await db.calendarFeed.upsert({ where: { studentId: me.studentId }, create: { collegeId: me.collegeId, studentId: me.studentId, tokenHash: hash(token) }, update: { tokenHash: hash(token), rotatedAt: new Date(), lastReadAt: null } });
  return `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/api/calendar/feed/${token}`;
}
/** The student a link belongs to, or a not-found error (the same one for a wrong and a revoked link). */
export async function sessionForFeed(token: string): Promise<StudentSession> {
  const f = await db.calendarFeed.findUnique({ where: { tokenHash: hash(token) }, select: { id: true, student: { select: { id: true, collegeId: true, college: { select: { isActive: true } }, departmentId: true, batchId: true, name: true, email: true, userId: true, isActive: true } } } });
  if (!f || !f.student.isActive || !f.student.college.isActive) throw notFound("Calendar not found"); // suspended institution looks like an unknown feed, and lastReadAt is not touched
  await db.calendarFeed.update({ where: { id: f.id }, data: { lastReadAt: new Date() } });
  const s = f.student;
  return { studentId: s.id, userId: s.userId ?? "", collegeId: s.collegeId, departmentId: s.departmentId, batchId: s.batchId, name: s.name, email: s.email };
}
