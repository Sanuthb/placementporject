import { db } from "@/lib/db";
import { notFound, badRequest } from "@/lib/api/errors";
import type { StudentSession } from "@/lib/auth/student";
import { attemptsLeft, courseProgress, hideAnswers, nextLesson, questionsOf } from "@/lib/lms";
import { orderedModules, signedUrl, visibleTo } from "@/lib/lmsService";

/** The course and my enrolment in it. Throws unless the course is one I may see. Archived courses stay open to students already in them. */
export async function myCourse(me: StudentSession, courseId: string) {
  const course = await db.course.findFirst({ where: { id: courseId, collegeId: me.collegeId } });
  const enrolment = course ? await db.courseEnrolment.findUnique({ where: { courseId_studentId: { courseId, studentId: me.studentId } } }) : null;
  const joined = !!enrolment && enrolment.status !== "WITHDRAWN";
  const open = !!course && ((course.status === "PUBLISHED" && visibleTo(course, me)) || (joined && course.status !== "DRAFT"));
  if (!course || !open) throw notFound("Course not found");
  return { course, enrolment: joined ? enrolment : null, withdrawn: enrolment?.status === "WITHDRAWN" ? enrolment : null };
}

export async function myEnrolledCourse(me: StudentSession, courseId: string) {
  const r = await myCourse(me, courseId);
  if (!r.enrolment) throw badRequest("Join this course first");
  return { course: r.course, enrolment: r.enrolment };
}

/** Courses I can browse, with where I am in each. */
export async function browse(me: StudentSession) {
  const [courses, mine, counts] = await Promise.all([
    db.course.findMany({ where: { collegeId: me.collegeId, OR: [{ status: "PUBLISHED" }, { enrolments: { some: { studentId: me.studentId } } }] }, orderBy: { publishedAt: "desc" }, include: { _count: { select: { lessons: true } }, lessons: { select: { id: true, required: true } } } }),
    db.courseEnrolment.findMany({ where: { studentId: me.studentId }, include: { progress: { select: { lessonId: true } }, certificate: { select: { serial: true } } } }),
    db.courseEnrolment.groupBy({ by: ["courseId"], where: { collegeId: me.collegeId, status: { not: "WITHDRAWN" } }, _count: true }),
  ]);
  return courses.flatMap((c) => {
    const e = mine.find((m) => m.courseId === c.id);
    const joined = !!e && e.status !== "WITHDRAWN";
    if (c.status === "ARCHIVED" && !joined) return [];
    if (!joined && !visibleTo(c, me)) return [];
    const p = joined ? courseProgress(c.lessons, new Set(e!.progress.map((x) => x.lessonId))) : null;
    return [{ id: c.id, title: c.title, summary: c.summary, category: c.category, level: c.level, skills: c.skills, status: c.status, lessons: c._count.lessons, learners: counts.find((x) => x.courseId === c.id)?._count ?? 0, certificate: c.certificateEnabled, selfEnrol: c.selfEnrol,
      enrolled: joined, completed: e?.status === "COMPLETED", percent: p?.percent ?? 0, certificateSerial: e?.certificate?.serial ?? null }];
  });
}

/**
 * The course as a student sees it. Before joining, only the outline (titles and types). After joining: the content, links to files, my progress,
 * quiz questions without their answers, my attempts, my submissions and my questions.
 */
export async function courseDetail(me: StudentSession, courseId: string) {
  const { course, enrolment, withdrawn } = await myCourse(me, courseId);
  const modules = await orderedModules(courseId);
  const flat = modules.flatMap((m) => m.lessons);
  const head = { id: course.id, title: course.title, summary: course.summary, description: course.description, category: course.category, level: course.level, skills: course.skills, status: course.status, certificateEnabled: course.certificateEnabled, selfEnrol: course.selfEnrol, wasWithdrawn: !!withdrawn };
  if (!enrolment) return { ...head, enrolled: false as const, modules: modules.map((m) => ({ id: m.id, title: m.title, lessons: m.lessons.map((l) => ({ id: l.id, title: l.title, type: l.type, required: l.required, durationMin: l.durationMin })) })) };

  const [progress, attempts, subs, doubts, cert] = await Promise.all([
    db.lessonProgress.findMany({ where: { enrolmentId: enrolment.id }, select: { lessonId: true, completedAt: true } }),
    db.quizAttempt.findMany({ where: { enrolmentId: enrolment.id }, orderBy: { attemptNumber: "asc" }, select: { lessonId: true, attemptNumber: true, percent: true, passed: true, createdAt: true } }),
    db.assignmentSubmission.findMany({ where: { enrolmentId: enrolment.id } }),
    db.courseQuestion.findMany({ where: { enrolmentId: enrolment.id }, orderBy: { createdAt: "desc" }, select: { id: true, lessonId: true, question: true, answer: true, answeredAt: true, createdAt: true } }),
    db.courseCertificate.findUnique({ where: { enrolmentId: enrolment.id }, select: { serial: true, issuedAt: true } }),
  ]);
  const done = new Set(progress.map((p) => p.lessonId));
  const p = courseProgress(flat, done);
  const next = nextLesson(flat.filter((l) => l.required), done);
  const lessonView = async (l: (typeof flat)[number]) => {
    const used = attempts.filter((a) => a.lessonId === l.id);
    const sub = subs.find((x) => x.lessonId === l.id);
    const base = { id: l.id, title: l.title, type: l.type, required: l.required, body: l.body, done: done.has(l.id), durationMin: l.durationMin };
    switch (l.type) {
      case "VIDEO": case "DOCUMENT": return { ...base, url: l.url, file: l.filePath ? { name: l.fileName, mimeType: l.mimeType, sizeBytes: l.sizeBytes, viewUrl: await signedUrl(l.filePath), downloadUrl: l.downloadable ? await signedUrl(l.filePath, l.fileName ?? "file") : null } : null };
      case "LINK": return { ...base, url: l.url };
      case "LIVE": return { ...base, url: l.startsAt && l.startsAt.getTime() - Date.now() > 15 * 60_000 ? null : l.url, startsAt: l.startsAt };
      case "ASSIGNMENT": return { ...base, dueAt: l.dueAt, maxMarks: l.maxMarks, submission: sub ? { status: sub.status, text: sub.text, fileName: sub.fileName, fileUrl: sub.filePath ? await signedUrl(sub.filePath) : null, marks: sub.marks, feedback: sub.feedback, submittedAt: sub.submittedAt, late: !!l.dueAt && sub.submittedAt > l.dueAt } : null };
      case "QUIZ": { const qs = questionsOf(l.questions); return { ...base, passPercent: l.passPercent, maxAttempts: l.maxAttempts, attemptsLeft: attemptsLeft(l.maxAttempts, used.length), questions: hideAnswers(qs), attempts: used, passed: used.some((a) => a.passed), bestPercent: used.length ? Math.max(...used.map((a) => a.percent)) : null }; }
      default: return base;
    }
  };
  return {
    ...head, enrolled: true as const, status_: enrolment.status, completedAt: enrolment.completedAt, progress: p, nextLessonId: next?.id ?? null, certificate: cert ? { ...cert, studentName: me.name } : null, questions: doubts,
    modules: await Promise.all(modules.map(async (m) => ({ id: m.id, title: m.title, lessons: await Promise.all(m.lessons.map(lessonView)) }))),
  };
}
