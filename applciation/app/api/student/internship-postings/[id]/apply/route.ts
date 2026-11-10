import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { notifyStaff } from "@/lib/notify";
import { gapsFor } from "@/lib/internshipService";

/** Apply to an open internship. The rules are checked now; a student who does not meet them cannot apply. */
export const POST = studentRoute<{ id: string }>({ module: "INTERNSHIPS", limit: { name: "internship-apply", max: 30, windowSec: 3600 } }, async (req, me, { id }) => {
  const p = await db.internshipPosting.findFirst({ where: { id, collegeId: me.collegeId } });
  if (!p || p.status !== "OPEN") throw notFound("Internship not found");
  if (p.applicationDeadline <= new Date()) throw badRequest("The application deadline has passed");
  const { note } = await parseBody(req, z.object({ note: z.string().trim().max(1500).optional() }));
  const gaps = await gapsFor(p, me.studentId);
  if (gaps.length) throw badRequest(gaps[0], gaps);
  try { await db.internshipApplication.create({ data: { collegeId: me.collegeId, studentId: me.studentId, postingId: id, note } }); } catch (e) { if ((e as { code?: string }).code === "P2002") throw badRequest("You have already applied to this internship"); throw e; }
  await notifyStaff(me.collegeId, { type: "internship.application", title: `${me.name} applied for ${p.title} at ${p.companyName}`, link: "/staff/internships", departmentId: me.departmentId });
  return { ok: true };
});
