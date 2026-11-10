import { studentRoute } from "@/lib/api/studentHandler";
import { readForm } from "@/lib/api/parse";
import { badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { notifyUserIds } from "@/lib/projectNotify";
import { notifyStaff } from "@/lib/notify";
import { myInternship, removeFile, storeDeliverable } from "@/lib/internshipService";
import { nextTask, type TaskStatus } from "@/lib/internships";
import { LIMITS } from "@/lib/resources";

/** Hand in my work for a task (multipart: "text", "url" and/or "file" as PDF, Word or PowerPoint up to 20 MB). A task sent back for changes can be handed in again. */
export const POST = studentRoute<{ id: string; taskId: string }>({ module: "INTERNSHIPS", limit: { name: "internship-submit", max: 60, windowSec: 3600 } }, async (req, me, { id, taskId }) => {
  const i = await myInternship(me, id);
  const t = await db.internshipTask.findFirst({ where: { id: taskId, internshipId: id } });
  if (!t) throw notFound("Task not found");
  if (i.status !== "ONGOING") throw badRequest("Work is handed in while the internship is ongoing");
  const next = nextTask(t.status as TaskStatus, "SUBMIT");
  if ("error" in next) throw badRequest(next.error);
  const form = await readForm(req, LIMITS.DOCUMENT);
  const text = String(form.get("text") ?? "").trim().slice(0, 10000), url = String(form.get("url") ?? "").trim().slice(0, 500), file = form.get("file");
  const hasFile = file instanceof File && file.size > 0;
  if (url && !/^https?:\/\/\S+$/.test(url)) throw badRequest("The link must start with http:// or https://");
  if (!text && !url && !hasFile && !t.filePath) throw badRequest("Write something, add a link or attach a file");
  const saved = hasFile ? await storeDeliverable(me.collegeId, id, file) : null;
  const done = await db.internshipTask.updateMany({ where: { id: taskId, status: t.status }, data: { status: next.status, submissionText: text || null, submissionUrl: url || null, ...(saved ? { filePath: saved.path, fileName: saved.name, fileMime: saved.mime } : {}), submittedAt: new Date(), reviewComment: null } });
  if (done.count === 0) throw badRequest("This task just changed. Reload and try again");
  if (saved && t.filePath) await removeFile(t.filePath);
  if (i.facultyMentorId) await notifyUserIds(me.collegeId, [i.facultyMentorId], { type: "internship.task", title: `${me.name} handed in "${t.title}"`, link: `/staff/internships/${id}` });
  else await notifyStaff(me.collegeId, { type: "internship.task", title: `${me.name} handed in "${t.title}"`, link: `/staff/internships/${id}`, departmentId: me.departmentId });
  return { status: next.status };
});
