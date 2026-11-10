import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { myInternship } from "@/lib/internshipService";
import { markProblem } from "@/lib/internships";

/** Mark my attendance for a working day in the last 7 days (PRESENT, ABSENT or LEAVE). My mentor verifies it. A verified day can only be corrected by staff. */
export const POST = studentRoute<{ id: string }>({ module: "INTERNSHIPS", limit: { name: "internship-attendance", max: 100, windowSec: 3600 } }, async (req, me, { id }) => {
  const i = await myInternship(me, id);
  const b = await parseBody(req, z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), status: z.enum(["PRESENT", "ABSENT", "LEAVE"]), note: z.string().trim().max(300).optional() }));
  if (i.status !== "ONGOING") throw badRequest("Attendance is marked while the internship is ongoing");
  const problem = markProblem(b.date, { start: i.startDate, end: i.endDate, workDays: i.workDays, today: new Date() });
  if (problem) throw badRequest(problem);
  const date = new Date(`${b.date}T00:00:00Z`);
  const old = await db.internshipAttendance.findUnique({ where: { internshipId_date: { internshipId: id, date } } });
  if (old?.verified) throw badRequest("This day was verified by your mentor. Ask them to correct it");
  await db.internshipAttendance.upsert({ where: { internshipId_date: { internshipId: id, date } }, create: { internshipId: id, date, status: b.status, note: b.note }, update: { status: b.status, note: b.note ?? null } });
  return { ok: true };
});
