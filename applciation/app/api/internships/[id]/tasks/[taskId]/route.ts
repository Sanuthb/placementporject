import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { notifyStudent } from "@/lib/notify";
import { internshipOf, removeFile } from "@/lib/internshipService";
import { nextTask, type TaskStatus } from "@/lib/internships";

const R = { module: "INTERNSHIPS" as const, facultyOk: true };
type P = { id: string; taskId: string };

/** Reviews a handed-in task: APPROVE it or REQUEST_CHANGES with a comment (required). The student is told. */
export const POST = route<P>(R, async (req, s, { id, taskId }) => {
  const i = await internshipOf(s, id);
  const t = await db.internshipTask.findFirst({ where: { id: taskId, internshipId: id } });
  if (!t) throw notFound("Task not found");
  const b = await parseBody(req, z.object({ action: z.enum(["APPROVE", "REQUEST_CHANGES"]), comment: z.string().trim().max(2000).optional() }));
  if (b.action === "REQUEST_CHANGES" && !(b.comment && b.comment.length >= 3)) throw badRequest("Say what needs to change");
  const next = nextTask(t.status as TaskStatus, b.action);
  if ("error" in next) throw badRequest(next.error);
  const me = await db.user.findUniqueOrThrow({ where: { id: s.userId }, select: { name: true } });
  const done = await db.internshipTask.updateMany({ where: { id: taskId, status: t.status }, data: { status: next.status, reviewComment: b.comment ?? null, reviewedByName: me.name, reviewedAt: new Date() } });
  if (done.count === 0) throw badRequest("This task was just changed. Reload and try again");
  await notifyStudent(s.collegeId, i.studentId, { type: "internship.task", title: b.action === "APPROVE" ? `Your work "${t.title}" was approved` : `Changes requested on "${t.title}"`, body: b.comment, link: "/student/internships" });
  return { status: next.status };
});

/** Removes a task nobody has handed in work for. */
export const DELETE = route<P>(R, async (_req, s, { id, taskId }) => {
  await internshipOf(s, id);
  const t = await db.internshipTask.findFirst({ where: { id: taskId, internshipId: id } });
  if (!t) throw notFound("Task not found");
  if (t.isFinalReport || t.submittedAt) throw badRequest("The final report and tasks with handed-in work cannot be removed");
  await db.internshipTask.delete({ where: { id: taskId } });
  await removeFile(t.filePath);
  return { ok: true };
});
