import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { studentResources } from "@/lib/resourceService";

const body = z.object({ opened: z.boolean().optional(), completed: z.boolean().optional(), rating: z.number().int().min(1).max(5).optional(), feedback: z.string().trim().max(1000).optional() });

/** Record that I opened it, finished it, or what I thought of it (1 to 5 and a note). Only for a resource I can open. Finishing is tied to the current version. */
export const POST = studentRoute<{ id: string }>({ module: "STUDENT_PREP", limit: { name: "resource-progress", max: 300, windowSec: 3600 } }, async (req, me, { id }) => {
  const r = (await studentResources(me)).find((x) => x.id === id);
  if (!r) throw notFound("Resource not found");
  const b = await parseBody(req, body);
  const now = new Date();
  const base = { resourceId: id, studentId: me.studentId, collegeId: me.collegeId };
  const prior = await db.resourceProgress.findUnique({ where: { resourceId_studentId: { resourceId: id, studentId: me.studentId } } });
  const data = {
    ...(b.opened || b.completed ? { openedAt: prior?.openedAt ?? now } : {}),
    ...(b.completed === true ? { completedAt: now, completedVersion: r.version } : b.completed === false ? { completedAt: null, completedVersion: null } : {}),
    ...(b.rating !== undefined ? { rating: b.rating } : {}), ...(b.feedback !== undefined ? { feedback: b.feedback || null } : {}),
  };
  await db.resourceProgress.upsert({ where: { resourceId_studentId: { resourceId: id, studentId: me.studentId } }, create: { ...base, ...data }, update: data });
  return { ok: true };
});
