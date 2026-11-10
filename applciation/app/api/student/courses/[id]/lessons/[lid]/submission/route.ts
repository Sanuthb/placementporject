import { studentRoute } from "@/lib/api/studentHandler";
import { readForm } from "@/lib/api/parse";
import { badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { DOC_MAX_BYTES } from "@/lib/documents";
import { markLessonDone, removeCourseFile, saveCourseFile } from "@/lib/lmsService";
import { myEnrolledCourse } from "@/lib/lmsStudent";
import { notifyStaff } from "@/lib/notify";

/**
 * Submit or resubmit an assignment (multipart: "text" and/or "file"; PDF, PNG or JPEG up to 10 MB). Allowed until it is graded; a returned one can be
 * sent again. Handing in finishes the lesson. Work after the due date is accepted and shown to the teacher as late.
 */
export const POST = studentRoute<{ id: string; lid: string }>({ module: "LEARNING", limit: { name: "course-submit", max: 60, windowSec: 3600 } }, async (req, me, { id, lid }) => {
  const { course, enrolment } = await myEnrolledCourse(me, id);
  const l = await db.courseLesson.findFirst({ where: { id: lid, courseId: id, type: "ASSIGNMENT" } });
  if (!l) throw notFound("Assignment not found");
  const form = await readForm(req, DOC_MAX_BYTES);
  const text = String(form.get("text") ?? "").trim().slice(0, 10000);
  const file = form.get("file");
  const hasFile = file instanceof File && file.size > 0;
  if (!text && !hasFile) throw badRequest("Write your answer or attach a file");
  const old = await db.assignmentSubmission.findUnique({ where: { lessonId_enrolmentId: { lessonId: lid, enrolmentId: enrolment.id } } });
  if (old?.status === "GRADED") throw badRequest("This assignment has been graded");
  const saved = hasFile ? await saveCourseFile(me.collegeId, id, file, "submission") : null;
  const data = { text: text || null, filePath: saved?.filePath ?? old?.filePath ?? null, fileName: saved?.fileName ?? old?.fileName ?? null, mimeType: saved?.mimeType ?? old?.mimeType ?? null, status: "SUBMITTED" as const, marks: null, feedback: null, gradedAt: null, gradedById: null, submittedAt: new Date() };
  const sub = old
    ? await db.assignmentSubmission.update({ where: { id: old.id }, data })
    : await db.assignmentSubmission.create({ data: { ...data, lessonId: lid, enrolmentId: enrolment.id, studentId: me.studentId } });
  if (saved && old?.filePath) await removeCourseFile(old.filePath);
  const completion = await markLessonDone(enrolment.id, lid);
  await notifyStaff(me.collegeId, { type: "course.submission", title: `${me.name} handed in "${l.title}"`, body: course.title, link: `/staff/courses/${id}` });
  return { status: sub.status, late: !!l.dueAt && sub.submittedAt > l.dueAt, courseCompleted: completion.complete, certificateSerial: completion.certificateSerial };
});
