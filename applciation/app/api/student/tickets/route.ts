import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { createTicket, ticketInput } from "@/lib/tickets";

const create = z.object({
  category: z.enum(["DATA_CORRECTION", "APPLICATION_ISSUE", "OTHER"]), subject: z.string().trim().min(3).max(200), message: z.string().trim().min(3).max(5000),
  section: z.enum(["PERSONAL", "ACADEMICS", "EDUCATION_HISTORY", "SKILLS", "PROJECTS", "INTERNSHIPS", "RESUME", "DOCUMENTS", "ACHIEVEMENTS"]).optional(), data: z.record(z.string(), z.unknown()).optional(),
});

export const GET = studentRoute({}, (_req, me) =>
  db.ticket.findMany({ where: { studentId: me.studentId }, select: { id: true, category: true, subject: true, status: true, section: true, createdAt: true, updatedAt: true, resolvedAt: true }, orderBy: { createdAt: "desc" }, take: 100 }),
);

/** Raise a request ("my marks are wrong", "I can't apply"). A correction to verified data goes into the verification queue. */
export const POST = studentRoute({ limit: { name: "ticket", max: 20, windowSec: 3600 } }, async (req, me) => {
  const input = await parseBody(req, create);
  const check = ticketInput.safeParse({ ...input, studentId: me.studentId });
  if (!check.success) throw check.error;
  const t = await createTicket({ collegeId: me.collegeId, userId: null }, check.data, me.studentId);
  return { id: t.id, status: t.status };
});
