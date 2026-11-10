import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { internshipOf } from "@/lib/internshipService";
import { markProblem } from "@/lib/internships";

const R = { module: "INTERNSHIPS" as const, facultyOk: true };

/**
 * The mentor or staff verify the days the student marked (ids), or mark or correct a day themselves (date and status). A correction counts as verified.
 * Staff can correct any day inside the internship, including ones the student can no longer change.
 */
export const POST = route<{ id: string }>(R, async (req, s, { id }) => {
  const i = await internshipOf(s, id);
  const b = await parseBody(req, z.object({ verifyIds: z.array(z.uuid()).max(100).optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), status: z.enum(["PRESENT", "ABSENT", "LEAVE"]).optional(), note: z.string().trim().max(300).optional() }));
  let verified = 0;
  if (b.verifyIds?.length) verified = (await db.internshipAttendance.updateMany({ where: { id: { in: b.verifyIds }, internshipId: id }, data: { verified: true, verifiedById: s.userId } })).count;
  if (b.date) {
    if (!b.status) throw badRequest("Choose present, absent or leave");
    const problem = markProblem(b.date, { start: i.startDate, end: i.endDate, workDays: i.workDays, today: new Date(), windowDays: 3650 });
    if (problem) throw badRequest(problem);
    const date = new Date(`${b.date}T00:00:00Z`);
    await db.internshipAttendance.upsert({ where: { internshipId_date: { internshipId: id, date } }, create: { internshipId: id, date, status: b.status, note: b.note, markedBy: "STAFF", verified: true, verifiedById: s.userId }, update: { status: b.status, note: b.note, markedBy: "STAFF", verified: true, verifiedById: s.userId } });
  }
  await audit(s, { action: "internship.attendance", entity: "Internship", entityId: id, after: { verified, corrected: b.date } });
  return { verified };
});
