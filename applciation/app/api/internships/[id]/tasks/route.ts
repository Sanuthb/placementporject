import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { notifyStudent } from "@/lib/notify";
import { internshipOf } from "@/lib/internshipService";

const R = { module: "INTERNSHIPS" as const, facultyOk: true };

/** Gives the intern a task (the faculty mentor or staff). The student is told and hands in their work; you review it. */
export const POST = route<{ id: string }>(R, async (req, s, { id }) => {
  const i = await internshipOf(s, id);
  const b = await parseBody(req, z.object({ title: z.string().trim().min(3).max(200), description: z.string().trim().max(3000).optional(), dueAt: z.coerce.date().optional() }));
  if (i.status === "COMPLETED" || i.status === "TERMINATED") throw badRequest("This internship is over");
  const me = await db.user.findUniqueOrThrow({ where: { id: s.userId }, select: { name: true } });
  const t = await db.internshipTask.create({ data: { ...b, internshipId: id, assignedByName: me.name, assignedByUserId: s.userId } });
  await notifyStudent(s.collegeId, i.studentId, { type: "internship.task", title: `New task: ${b.title}`, link: "/student/internships" });
  return t;
});
