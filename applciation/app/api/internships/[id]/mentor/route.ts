import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyUserIds } from "@/lib/projectNotify";
import { INT_ADMIN, internshipOf } from "@/lib/internshipService";

/** Names the faculty mentor who follows this student through the internship (null removes them). The company's own mentor is set when the internship is created. */
export const PUT = route<{ id: string }>(INT_ADMIN, async (req, s, { id }) => {
  const i = await internshipOf(s, id);
  const { facultyMentorId, industryMentorName, industryMentorEmail } = await parseBody(req, z.object({ facultyMentorId: z.uuid().nullish(), industryMentorName: z.string().trim().max(120).nullish(), industryMentorEmail: z.email().nullish() }));
  if (facultyMentorId && !(await db.user.findFirst({ where: { id: facultyMentorId, collegeId: s.collegeId, isActive: true, OR: [{ role: "FACULTY" }, { extraRoles: { has: "FACULTY" } }] }, select: { id: true } }))) throw badRequest("The mentor must be an active faculty member");
  await db.internship.update({ where: { id }, data: { ...(facultyMentorId !== undefined ? { facultyMentorId } : {}), ...(industryMentorName !== undefined ? { mentorName: industryMentorName } : {}), ...(industryMentorEmail !== undefined ? { mentorEmail: industryMentorEmail } : {}) } });
  if (facultyMentorId && facultyMentorId !== i.facultyMentorId) await notifyUserIds(s.collegeId, [facultyMentorId], { type: "internship.mentor", title: "You were named as an internship mentor", link: `/staff/internships/${id}` });
  await audit(s, { action: "internship.mentor", entity: "Internship", entityId: id, after: { facultyMentorId } });
  return { ok: true };
});
