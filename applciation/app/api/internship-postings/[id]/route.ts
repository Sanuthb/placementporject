import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { INT_ADMIN } from "@/lib/internshipService";
import { postingProblems } from "@/lib/internships";
import { checkPosting, postingFields } from "../route";

type P = { id: string };
const find = async (collegeId: string, id: string) => { const p = await db.internshipPosting.findFirst({ where: { id, collegeId } }); if (!p) throw notFound("Posting not found"); return p; };

export const GET = route<P>(INT_ADMIN, async (_req, s, { id }) => {
  const p = await find(s.collegeId, id);
  return { ...p, problems: postingProblems(p) };
});

const patch = postingFields.partial().extend({ companyConfirmed: z.boolean().optional(), companyConfirmedNote: z.string().trim().max(500).nullish() });
/** Edits a posting. Recording that the company confirmed it is what lets it open. */
export const PATCH = route<P>(INT_ADMIN, async (req, s, { id }) => {
  const p = await find(s.collegeId, id);
  const b = await parseBody(req, patch);
  if (p.status === "CANCELLED") throw badRequest("A cancelled posting cannot be changed");
  const companyName = (b.companyId || b.companyName) ? await checkPosting(s.collegeId, b) : undefined;
  await checkPosting(s.collegeId, { startDate: b.startDate ?? p.startDate, endDate: b.endDate ?? p.endDate, applicationDeadline: b.applicationDeadline ?? p.applicationDeadline });
  const u = await db.internshipPosting.update({ where: { id }, data: { ...b, ...(companyName ? { companyName } : {}) } });
  await audit(s, { action: "internship_posting.update", entity: "InternshipPosting", entityId: id, before: { title: p.title }, after: { title: u.title, companyConfirmed: u.companyConfirmed } });
  return u;
});

export const DELETE = route<P>(INT_ADMIN, async (_req, s, { id }) => {
  const p = await find(s.collegeId, id);
  if (p.status !== "DRAFT" || (await db.internshipApplication.count({ where: { postingId: id } })) > 0) throw badRequest("Only a draft with no applications can be deleted. Cancel it instead");
  await db.internshipPosting.delete({ where: { id } });
  await audit(s, { action: "internship_posting.delete", entity: "InternshipPosting", entityId: id, before: { title: p.title } });
  return { ok: true };
});
