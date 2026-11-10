import { studentRoute } from "@/lib/api/studentHandler";
import { db } from "@/lib/db";
import { checkEligibility } from "@/lib/internships";
import { factsOf, rulesOf } from "@/lib/internshipService";

/** Internships open to apply for, each with whether I meet the rules (and which I do not) and where my application stands. */
export const GET = studentRoute({ module: "INTERNSHIPS" }, async (_req, me) => {
  const [rows, mine, facts] = await Promise.all([
    db.internshipPosting.findMany({ where: { collegeId: me.collegeId, status: "OPEN", applicationDeadline: { gt: new Date() } }, orderBy: { applicationDeadline: "asc" }, take: 100 }),
    db.internshipApplication.findMany({ where: { studentId: me.studentId, postingId: { not: null } }, select: { postingId: true, status: true } }),
    factsOf(me.studentId),
  ]);
  return rows.map((p) => {
    const gaps = checkEligibility(rulesOf(p), facts);
    const app = mine.find((a) => a.postingId === p.id);
    return { id: p.id, title: p.title, companyName: p.companyName, description: p.description, location: p.location, mode: p.mode, stipendInr: p.stipendInr, openings: p.openings, skills: p.skills, startDate: p.startDate, endDate: p.endDate, applicationDeadline: p.applicationDeadline, eligible: gaps.length === 0, gaps, application: app?.status ?? null };
  });
});
