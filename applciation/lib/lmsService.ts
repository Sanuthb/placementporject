import { randomBytes, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import type { Course, Prisma } from "@/generated/prisma/client";
import { badRequest, notFound } from "@/lib/api/errors";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { notifyStudent } from "@/lib/notify";
import { DocumentRejected, inspectUpload } from "@/lib/documents";
import { COURSE_VIDEO_MAX, certificateSerial, courseProgress, engagement, questionGaps, questionsOf, sniffMedia } from "@/lib/lms";

export const COURSE_BUCKET = "student-documents";
type Tx = Prisma.TransactionClient | typeof db;

export async function courseOf(collegeId: string, id: string) {
  const c = await db.course.findFirst({ where: { id, collegeId } });
  if (!c) throw notFound("Course not found");
  return c;
}

/** Modules with their lessons, in the order a student meets them. */
export const orderedModules = (courseId: string) =>
  db.courseModule.findMany({ where: { courseId }, orderBy: { sortOrder: "asc" }, include: { lessons: { orderBy: { sortOrder: "asc" } } } });

/** A student sees a published course when it is open to everyone, or to their own department and batch. */
export const visibleTo = (c: Pick<Course, "departmentId" | "batchId">, s: { departmentId: string; batchId: string }) =>
  (!c.departmentId || c.departmentId === s.departmentId) && (!c.batchId || c.batchId === s.batchId);

export const signedUrl = async (path: string, download?: string) =>
  (await supabaseAdmin().storage.from(COURSE_BUCKET).createSignedUrl(path, 3600, download ? { download } : undefined)).data?.signedUrl ?? null;

/**
 * Stores a file for a course. `kind` "lesson" accepts PDF, PNG, JPEG and MP4/WebM video; "submission" accepts PDF, PNG and JPEG only.
 * The type is read from the file's bytes.
 */
export async function saveCourseFile(collegeId: string, courseId: string, file: File, kind: "lesson" | "submission") {
  const bytes = Buffer.from(await file.arrayBuffer());
  const video = kind === "lesson" ? sniffMedia(bytes) : null;
  let mime: string, safe: string;
  if (video) {
    if (bytes.length > COURSE_VIDEO_MAX) throw badRequest("Videos can be at most 50 MB. Upload larger ones to a video site and add the link instead");
    if (file.type && file.type !== video) throw badRequest("The file content does not match its type");
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    if (!(video === "video/mp4" ? ["mp4", "m4v"] : ["webm"]).includes(ext)) throw badRequest("The file name does not match its type");
    mime = video; safe = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-100);
  } else {
    try { const i = inspectUpload(bytes, file.type, file.name); mime = i.mime; safe = i.safeName; } catch (e) { if (e instanceof DocumentRejected) throw badRequest(e.message); throw e; }
  }
  const path = `${collegeId}/courses/${courseId}/${kind}/${randomUUID()}-${safe}`;
  const up = await supabaseAdmin().storage.from(COURSE_BUCKET).upload(path, bytes, { contentType: mime });
  if (up.error) throw badRequest("Upload failed: " + up.error.message);
  return { filePath: path, fileName: file.name.slice(0, 200), mimeType: mime, sizeBytes: bytes.length };
}

export async function removeCourseFile(path: string | null | undefined) {
  if (path) await supabaseAdmin().storage.from(COURSE_BUCKET).remove([path]).catch(() => undefined);
}

/** Enrols students who are not in the course yet and tells them. Returns how many were added. */
export async function enrolStudents(course: Pick<Course, "id" | "collegeId" | "title">, studentIds: string[], enrolledById: string | null) {
  if (!studentIds.length) return 0;
  const made = await db.courseEnrolment.createManyAndReturn({ data: studentIds.map((studentId) => ({ courseId: course.id, studentId, collegeId: course.collegeId, enrolledById })), skipDuplicates: true, select: { studentId: true } });
  if (made.length) await db.notification.createMany({ data: made.map((m) => ({ collegeId: course.collegeId, studentId: m.studentId, type: "course.enrolled", title: `You were enrolled in ${course.title}`, link: `/student/courses/${course.id}` })) });
  return made.length;
}

/**
 * Marks a lesson done for an enrolment, then checks whether the course is finished. When it is, the enrolment is completed and,
 * if the course gives certificates, one is issued. Safe to call twice. A course that later gets new lessons does not un-complete anyone.
 */
export async function markLessonDone(enrolmentId: string, lessonId: string) {
  await db.lessonProgress.createMany({ data: [{ enrolmentId, lessonId }], skipDuplicates: true });
  await db.courseEnrolment.update({ where: { id: enrolmentId }, data: { lastActivityAt: new Date() } });
  return refreshCompletion(enrolmentId);
}

export async function refreshCompletion(enrolmentId: string, tx: Tx = db) {
  const e = await tx.courseEnrolment.findUniqueOrThrow({ where: { id: enrolmentId }, include: { course: true, progress: { select: { lessonId: true } } } });
  const lessons = await tx.courseLesson.findMany({ where: { courseId: e.courseId }, select: { id: true, required: true } });
  const p = courseProgress(lessons, new Set(e.progress.map((x) => x.lessonId)));
  if (!p.complete || e.status !== "ENROLLED") return { ...p, certificateSerial: null as string | null };
  const now = new Date();
  const claimed = await tx.courseEnrolment.updateMany({ where: { id: e.id, status: "ENROLLED" }, data: { status: "COMPLETED", completedAt: now } });
  if (claimed.count === 0) return { ...p, certificateSerial: null }; // another request got there first
  let serial: string | null = null;
  if (e.course.certificateEnabled) {
    serial = certificateSerial(now.getFullYear(), randomBytes(4).toString("hex"));
    await tx.courseCertificate.create({ data: { courseId: e.courseId, enrolmentId: e.id, studentId: e.studentId, collegeId: e.collegeId, serial, issuedAt: now } });
  }
  await notifyStudent(e.collegeId, e.studentId, { type: "course.completed", title: `You completed ${e.course.title}`, body: serial ? "Your certificate is ready." : undefined, link: `/student/courses/${e.courseId}` }, tx);
  return { ...p, certificateSerial: serial };
}

/** Per-student state for the staff roster and the analytics. */
export async function roster(courseId: string) {
  const [lessons, enrolments] = await Promise.all([
    db.courseLesson.findMany({ where: { courseId }, select: { id: true, required: true, type: true } }),
    db.courseEnrolment.findMany({
      where: { courseId }, orderBy: { enrolledAt: "desc" },
      include: { student: { select: { id: true, name: true, enrollmentNo: true, departmentId: true } }, progress: { select: { lessonId: true } }, attempts: { select: { lessonId: true, percent: true, passed: true, attemptNumber: true } }, submissions: { select: { marks: true, status: true } }, certificate: { select: { serial: true } } },
    }),
  ]);
  return enrolments.map((e) => {
    const p = courseProgress(lessons, new Set(e.progress.map((x) => x.lessonId)));
    const best = new Map<string, number>();
    for (const a of e.attempts) best.set(a.lessonId, Math.max(best.get(a.lessonId) ?? 0, a.percent));
    const avgQuiz = best.size ? Math.round([...best.values()].reduce((a, b) => a + b, 0) / best.size) : null;
    return {
      enrolmentId: e.id, student: e.student, status: e.status, enrolledAt: e.enrolledAt, completedAt: e.completedAt, lastActivityAt: e.lastActivityAt, selfEnrolled: e.enrolledById === null,
      percent: p.percent, lessonsDone: p.done, lessonsTotal: p.total, avgQuizPercent: avgQuiz, assignmentsToGrade: e.submissions.filter((s) => s.status === "SUBMITTED").length, certificate: e.certificate?.serial ?? null,
      engagement: engagement({ complete: p.complete || e.status === "COMPLETED", done: p.done, lastActivityAt: e.lastActivityAt, enrolledAt: e.enrolledAt }),
    };
  });
}

/** Enrolment, progress, completion, scores, learning gaps and engagement for one course. */
export async function courseAnalytics(collegeId: string, courseId: string) {
  const course = await courseOf(collegeId, courseId);
  const [rows, lessons, attempts, subs, doubts] = await Promise.all([
    roster(courseId),
    db.courseLesson.findMany({ where: { courseId }, orderBy: [{ module: { sortOrder: "asc" } }, { sortOrder: "asc" }], select: { id: true, title: true, type: true, required: true, questions: true, maxMarks: true, _count: { select: { progress: true } } } }),
    db.quizAttempt.findMany({ where: { lesson: { courseId } }, orderBy: { attemptNumber: "asc" }, select: { lessonId: true, enrolmentId: true, answers: true, percent: true } }),
    db.assignmentSubmission.groupBy({ by: ["lessonId", "status"], where: { lesson: { courseId } }, _count: true, _avg: { marks: true } }),
    db.courseQuestion.count({ where: { courseId, answeredAt: null } }),
  ]);
  const enrolled = rows.filter((r) => r.status !== "WITHDRAWN");
  const count = (k: string) => enrolled.filter((r) => r.engagement === k).length;
  const quizzes = lessons.filter((l) => l.type === "QUIZ").map((l) => {
    const latest = new Map<string, { answers: (number | null)[]; percent: number }>();
    for (const a of attempts.filter((x) => x.lessonId === l.id)) latest.set(a.enrolmentId, { answers: a.answers as (number | null)[], percent: a.percent });
    const l2 = [...latest.values()];
    return { lessonId: l.id, title: l.title, students: l2.length, averagePercent: l2.length ? Math.round(l2.reduce((a, b) => a + b.percent, 0) / l2.length) : null, hardestQuestions: questionGaps(questionsOf(l.questions), l2.map((x) => x.answers)).slice(0, 5) };
  });
  const assignments = lessons.filter((l) => l.type === "ASSIGNMENT").map((l) => {
    const mine = subs.filter((s) => s.lessonId === l.id);
    const n = (st: string) => mine.find((m) => m.status === st)?._count ?? 0;
    const graded = mine.find((m) => m.status === "GRADED");
    return { lessonId: l.id, title: l.title, submitted: mine.reduce((a, m) => a + m._count, 0), toGrade: n("SUBMITTED"), averageMarks: graded?._avg.marks == null ? null : Math.round(graded._avg.marks * 10) / 10, maxMarks: l.maxMarks };
  });
  const stuck = lessons.filter((l) => l.required).map((l) => ({ lessonId: l.id, title: l.title, finished: l._count.progress, finishedPercent: enrolled.length ? Math.round((l._count.progress / enrolled.length) * 100) : 0 }));
  const scored = enrolled.filter((r) => r.avgQuizPercent !== null);
  return {
    course: { id: course.id, title: course.title, status: course.status },
    enrolment: { total: enrolled.length, completed: count("COMPLETED"), active: count("ACTIVE"), notStarted: count("NOT_STARTED"), stalled: count("STALLED"), withdrawn: rows.length - enrolled.length, selfEnrolled: enrolled.filter((r) => r.selfEnrolled).length },
    completionPercent: enrolled.length ? Math.round((count("COMPLETED") / enrolled.length) * 100) : 0,
    averageProgressPercent: enrolled.length ? Math.round(enrolled.reduce((a, r) => a + r.percent, 0) / enrolled.length) : 0,
    averageQuizPercent: scored.length ? Math.round(scored.reduce((a, r) => a + (r.avgQuizPercent ?? 0), 0) / scored.length) : null,
    quizzes, assignments,
    /** Lessons fewer students have finished than the one before: where learners stop. */
    lessonCompletion: stuck, unansweredQuestions: doubts,
    stalledStudents: enrolled.filter((r) => r.engagement === "STALLED").slice(0, 50).map((r) => ({ studentId: r.student.id, name: r.student.name, percent: r.percent, lastActivityAt: r.lastActivityAt })),
  };
}

/** One line per course for the staff list: enrolment and completion at a glance. */
export async function courseOverview(collegeId: string) {
  const [courses, groups] = await Promise.all([
    db.course.findMany({ where: { collegeId }, orderBy: { createdAt: "desc" }, take: 200, include: { _count: { select: { lessons: true } } } }),
    db.courseEnrolment.groupBy({ by: ["courseId", "status"], where: { collegeId }, _count: true }),
  ]);
  return courses.map((c) => {
    const g = (s: string) => groups.find((x) => x.courseId === c.id && x.status === s)?._count ?? 0;
    const completed = g("COMPLETED"), enrolled = g("ENROLLED") + completed;
    return { id: c.id, title: c.title, category: c.category, level: c.level, status: c.status, lessons: c._count.lessons, enrolled, completed, completionPercent: enrolled ? Math.round((completed / enrolled) * 100) : 0, publishedAt: c.publishedAt, departmentId: c.departmentId, batchId: c.batchId };
  });
}

import type { ModuleKey, Role } from "@/generated/prisma/client";
export const LMS_STAFF: { roles: Role[]; module: ModuleKey } = { roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "LEARNING" };

/** The whole college at a glance: courses, learners, completion, engagement and a department breakdown. */
export async function learningSummary(collegeId: string) {
  const [courses, enrolments, lessons, activeStudents, toGrade, unanswered, departments] = await Promise.all([
    db.course.groupBy({ by: ["status"], where: { collegeId }, _count: true }),
    db.courseEnrolment.findMany({ where: { collegeId, status: { not: "WITHDRAWN" } }, take: 20000, select: { id: true, courseId: true, studentId: true, status: true, enrolledAt: true, lastActivityAt: true, course: { select: { title: true } }, student: { select: { departmentId: true } }, progress: { select: { lessonId: true } } } }),
    db.courseLesson.findMany({ where: { collegeId }, select: { id: true, courseId: true, required: true } }),
    db.student.count({ where: { collegeId, isActive: true, isArchived: false } }),
    db.assignmentSubmission.count({ where: { status: "SUBMITTED", lesson: { collegeId } } }),
    db.courseQuestion.count({ where: { collegeId, answeredAt: null } }),
    db.department.findMany({ where: { collegeId }, select: { id: true, name: true } }),
  ]);
  const byCourse = new Map<string, { id: string; required: boolean }[]>();
  for (const l of lessons) byCourse.set(l.courseId, [...(byCourse.get(l.courseId) ?? []), l]);
  const tally = { COMPLETED: 0, ACTIVE: 0, NOT_STARTED: 0, STALLED: 0 };
  const dept = new Map<string, { enrolled: number; completed: number; learners: Set<string> }>();
  const per = new Map<string, { title: string; enrolled: number; completed: number }>();
  for (const e of enrolments) {
    const p = courseProgress(byCourse.get(e.courseId) ?? [], new Set(e.progress.map((x) => x.lessonId)));
    const done = p.complete || e.status === "COMPLETED";
    tally[engagement({ complete: done, done: p.done, lastActivityAt: e.lastActivityAt, enrolledAt: e.enrolledAt })]++;
    const d = dept.get(e.student.departmentId) ?? { enrolled: 0, completed: 0, learners: new Set<string>() };
    d.enrolled++; d.learners.add(e.studentId); if (done) d.completed++; dept.set(e.student.departmentId, d);
    const c = per.get(e.courseId) ?? { title: e.course.title, enrolled: 0, completed: 0 };
    c.enrolled++; if (done) c.completed++; per.set(e.courseId, c);
  }
  const learners = new Set(enrolments.map((e) => e.studentId)).size;
  const n = (s: string) => courses.find((c) => c.status === s)?._count ?? 0;
  return {
    courses: { published: n("PUBLISHED"), draft: n("DRAFT"), archived: n("ARCHIVED") },
    enrolments: enrolments.length, learners, activeStudents, learnerPercent: activeStudents ? Math.round((learners / activeStudents) * 100) : 0,
    completed: tally.COMPLETED, completionPercent: enrolments.length ? Math.round((tally.COMPLETED / enrolments.length) * 100) : 0,
    active: tally.ACTIVE, notStarted: tally.NOT_STARTED, stalled: tally.STALLED, assignmentsToGrade: toGrade, unansweredQuestions: unanswered,
    byDepartment: departments.flatMap((d) => { const x = dept.get(d.id); return x ? [{ department: d.name, learners: x.learners.size, enrolments: x.enrolled, completionPercent: Math.round((x.completed / x.enrolled) * 100) }] : [] }),
    topCourses: [...per.values()].sort((a, b) => b.enrolled - a.enrolled).slice(0, 5).map((c) => ({ ...c, completionPercent: Math.round((c.completed / c.enrolled) * 100) })),
  };
}
