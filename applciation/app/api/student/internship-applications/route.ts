import { studentRoute } from "@/lib/api/studentHandler";
import { readForm } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { notifyStaff } from "@/lib/notify";
import { DOC_MAX_BYTES } from "@/lib/documents";
import { storeProof } from "@/lib/internshipService";
import { randomUUID } from "node:crypto";

/** My applications, including internships I found myself. */
export const GET = studentRoute({ module: "INTERNSHIPS" }, async (_req, me) => {
  const rows = await db.internshipApplication.findMany({ where: { studentId: me.studentId }, orderBy: { createdAt: "desc" }, include: { posting: { select: { title: true, companyName: true } } } });
  return rows.map((a) => ({ id: a.id, status: a.status, selfSourced: a.selfSourced, collegeNote: a.collegeNote, companyNote: a.companyNote, createdAt: a.createdAt, title: a.posting?.title ?? a.role, company: a.posting?.companyName ?? a.companyName }));
});

/**
 * Submit an internship I found myself for the college's approval (multipart: companyName, role, startDate, endDate, optional mentorName and mentorEmail, note, and
 * the company's offer letter as "file", a PDF, PNG or JPEG up to 10 MB). The college approves it; the company's selection is not needed.
 */
export const POST = studentRoute({ module: "INTERNSHIPS", limit: { name: "internship-self", max: 10, windowSec: 86400 } }, async (req, me) => {
  const f = await readForm(req, DOC_MAX_BYTES);
  const s = (k: string) => String(f.get(k) ?? "").trim();
  const file = f.get("file");
  const startDate = new Date(s("startDate")), endDate = new Date(s("endDate"));
  if (s("companyName").length < 2 || s("role").length < 2) throw badRequest("Give the company and the role");
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) throw badRequest("Give a start date and a later end date");
  if (!(file instanceof File)) throw badRequest("Attach the company's offer letter");
  if (s("mentorEmail") && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s("mentorEmail"))) throw badRequest("The mentor's email is not valid");
  if (await db.internship.findFirst({ where: { studentId: me.studentId, status: { in: ["ALLOTTED", "ONGOING"] } } })) throw badRequest("You already have an internship in progress");
  const proof = await storeProof(me.collegeId, `self-${randomUUID()}`, "offer", file);
  const a = await db.internshipApplication.create({ data: { collegeId: me.collegeId, studentId: me.studentId, selfSourced: true, companyName: s("companyName").slice(0, 200), role: s("role").slice(0, 150), startDate, endDate, mentorName: s("mentorName").slice(0, 120) || null, mentorEmail: s("mentorEmail") || null, note: s("note").slice(0, 1500) || null, offerLetterPath: proof.path, offerLetterName: proof.name } });
  await notifyStaff(me.collegeId, { type: "internship.application", title: `${me.name} submitted a self-found internship at ${a.companyName}`, link: "/staff/internships", departmentId: me.departmentId });
  return { id: a.id };
});
