import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { departmentScope } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { approvedJd, eligibilityRows, MATCH_ADMIN, MAX_POOL } from "@/lib/matchingService";
import { jobFor } from "@/lib/readinessService";

const CAP = Math.min(MAX_POOL, 500);

/**
 * How prepared the students are for one approved job, with the eligibility gate beside each score. Restrict to a campaign's members with `?campaignId=` or to a department.
 * By default it lists the students who are eligible; with `?includeIneligible=1` the others are listed too, marked as not eligible. Readiness is information for coaching, not a filter.
 */
export const GET = route<{ id: string }>(MATCH_ADMIN, async (req, s, { id }) => {
  const q = parseQuery(req, z.object({ campaignId: z.uuid().optional(), departmentId: z.uuid().optional(), includeIneligible: z.enum(["0", "1"]).default("0") }));
  const { jd, data } = await approvedJd(s.collegeId, id);
  let ids: string[] | null = null;
  if (q.campaignId) ids = (await db.campaignMember.findMany({ where: { campaignId: q.campaignId, campaign: { collegeId: s.collegeId, jdId: id }, status: { not: "REMOVED" } }, select: { studentId: true } })).map((m) => m.studentId);
  const scope = departmentScope(s);
  const rows = (await eligibilityRows(jd, data)).filter((r) => (!ids || ids.includes(r.studentId)) && (!q.departmentId || r.departmentId === q.departmentId) && (!scope.departmentId || r.departmentId === scope.departmentId) && (q.includeIneligible === "1" || r.eligible || !!ids));
  const picked = rows.slice(0, CAP);
  const res = await jobFor(jd, data, picked.map((r) => r.studentId), "staff");
  const out = picked.flatMap((r) => { const x = res.get(r.studentId); return x ? [{ studentId: r.studentId, name: r.name, enrollmentNo: r.enrollmentNo, gate: x.gate, gateLabel: x.gateLabel, score: x.score, band: x.band, coverage: x.coverage, missingSkills: x.match.skills.missing, weakest: x.components.filter((c) => c.value !== null).sort((a, b) => a.value! - b.value!)[0]?.label ?? null }] : []; });
  return { job: { id: jd.id, title: jd.title, company: jd.companyName }, truncated: rows.length > CAP, students: out.sort((a, b) => Number(b.gate !== "NOT_ELIGIBLE") - Number(a.gate !== "NOT_ELIGIBLE") || b.score - a.score || a.name.localeCompare(b.name)) };
});
