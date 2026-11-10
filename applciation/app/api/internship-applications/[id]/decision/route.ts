import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyStudent } from "@/lib/notify";
import { INT_ADMIN, allotFromApplication } from "@/lib/internshipService";
import { nextApplication, type AppAction, type AppStatus } from "@/lib/internships";

const body = z.object({ action: z.enum(["COLLEGE_APPROVE", "COLLEGE_REJECT", "COMPANY_SELECT", "COMPANY_REJECT"]), note: z.string().trim().max(1000).optional(), facultyMentorId: z.uuid().nullish() });

/**
 * The two approvals. COLLEGE_APPROVE or COLLEGE_REJECT first; then, for an internship from a posting, the company's decision is recorded with COMPANY_SELECT
 * or COMPANY_REJECT. Selecting a student (or approving one who found their own internship) creates the internship. A reason is needed to reject.
 */
export const POST = route<{ id: string }>(INT_ADMIN, async (req, s, { id }) => {
  const a = await db.internshipApplication.findFirst({ where: { id, collegeId: s.collegeId }, include: { posting: { select: { title: true, companyName: true } } } });
  if (!a) throw notFound("Application not found");
  const b = await parseBody(req, body);
  if (b.action.endsWith("REJECT") && !(b.note && b.note.length >= 3)) throw badRequest("Say why it is rejected");
  const next = nextApplication(a.status as AppStatus, b.action as AppAction, a.selfSourced);
  if ("error" in next) throw badRequest(next.error);
  if (b.facultyMentorId && !(await db.user.findFirst({ where: { id: b.facultyMentorId, collegeId: s.collegeId, isActive: true, OR: [{ role: "FACULTY" }, { extraRoles: { has: "FACULTY" } }] }, select: { id: true } }))) throw badRequest("The mentor must be an active faculty member");
  if (a.selfSourced && b.action === "COLLEGE_APPROVE" && !(a.offerLetterPath && a.startDate && a.endDate)) throw badRequest("A self-found internship needs its offer letter and dates before it can be approved");
  const decision = b.action.startsWith("COLLEGE") ? { collegeDecidedById: s.userId, collegeDecidedAt: new Date(), collegeNote: b.note ?? null } : { companyDecidedAt: new Date(), companyNote: b.note ?? null };

  if (next.status === "ALLOTTED") {
    const i = await allotFromApplication(id, { userId: s.userId, collegeId: s.collegeId }, { facultyMentorId: b.facultyMentorId, from: a.status, decision });
    await audit(s, { action: `internship_application.${b.action.toLowerCase()}`, entity: "InternshipApplication", entityId: id, after: { internshipId: i.id } });
    return { status: "ALLOTTED", internshipId: i.id };
  }
  const done = await db.internshipApplication.updateMany({ where: { id, status: a.status }, data: { status: next.status, ...decision } });
  if (done.count === 0) throw badRequest("This application was just changed by someone else. Reload and try again");
  const title = a.posting ? `${a.posting.title} at ${a.posting.companyName}` : `${a.role} at ${a.companyName}`;
  await notifyStudent(s.collegeId, a.studentId, { type: "internship.application", title: next.status === "COLLEGE_APPROVED" ? `Your application for ${title} was approved by the college` : `Your application for ${title} was not successful`, body: b.note, link: "/student/internships" });
  await audit(s, { action: `internship_application.${b.action.toLowerCase()}`, entity: "InternshipApplication", entityId: id, after: { status: next.status } });
  return { status: next.status };
});
