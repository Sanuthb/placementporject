import { route } from "@/lib/api/handler";
import { readForm } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { LMS_STAFF, removeCourseFile, saveCourseFile } from "@/lib/lmsService";
import { COURSE_VIDEO_MAX } from "@/lib/lms";
import { lessonOf } from "../route";

type P = { id: string; lid: string };

/** Uploads the file for a video or document lesson (multipart field "file"). Replaces any earlier file. PDF, PNG, JPEG up to 10 MB; MP4 or WebM video up to 50 MB. */
export const POST = route<P>(LMS_STAFF, async (req, s, { id, lid }) => {
  const l = await lessonOf(s.collegeId, id, lid);
  if (l.type !== "VIDEO" && l.type !== "DOCUMENT") throw badRequest("Only video and document lessons take a file");
  const file = (await readForm(req, COURSE_VIDEO_MAX)).get("file");
  if (!(file instanceof File)) throw badRequest('Send the file as multipart field "file"');
  const saved = await saveCourseFile(s.collegeId, id, file, "lesson");
  if (l.type === "DOCUMENT" && saved.mimeType.startsWith("video/")) { await removeCourseFile(saved.filePath); throw badRequest("A document lesson takes a PDF or an image"); }
  await db.courseLesson.update({ where: { id: lid }, data: saved });
  await removeCourseFile(l.filePath);
  return { fileName: saved.fileName, mimeType: saved.mimeType };
});

export const DELETE = route<P>(LMS_STAFF, async (_req, s, { id, lid }) => {
  const l = await lessonOf(s.collegeId, id, lid);
  await db.courseLesson.update({ where: { id: lid }, data: { filePath: null, fileName: null, mimeType: null, sizeBytes: null } });
  await removeCourseFile(l.filePath);
  return { ok: true };
});
