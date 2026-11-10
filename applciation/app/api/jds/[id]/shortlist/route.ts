import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyStudent } from "@/lib/notify";
import { MATCH_ADMIN, approvedJd, eligibilityRows } from "@/lib/matchingService";
import { matchStudent } from "@/lib/matching";
import { buildMaster } from "@/lib/resumeEngine";
import { loadInputsMany } from "@/lib/resumeService";
import { sheetResponse } from "@/lib/xlsx";

export const GET = route<{ id: string }>(MATCH_ADMIN, async (req, s, { id }) => {
  const { data } = await approvedJd(s.collegeId, id);
  const rows = await db.jdShortlist.findMany({ where: { jdId: id }, orderBy: [{ score: "desc" }, { createdAt: "asc" }], include: { student: { select: { name: true, enrollmentNo: true, email: true, department: { select: { name: true } } } } } });
  const decider = await db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.decidedById))] } }, select: { id: true, name: true } });
  const out = rows.map((r) => ({ studentId: r.studentId, name: r.student.name, enrollmentNo: r.student.enrollmentNo, department: r.student.department.name, score: r.score, mandatoryStatus: r.mandatoryStatus, note: r.note, decidedBy: decider.find((d) => d.id === r.decidedById)?.name ?? "", createdAt: r.createdAt }));
  if (new URL(req.url).searchParams.get("format") === "xlsx") return sheetResponse(`shortlist-${data.title}.xlsx`, ["Name", "Enrollment no", "Department", "Match score", "Required criteria", "Note", "Shortlisted by"], out.map((x) => [x.name, x.enrollmentNo, x.department, x.score, x.mandatoryStatus, x.note ?? "", x.decidedBy]));
  return out;
});

const body = z.object({ studentIds: z.array(z.uuid()).min(1).max(200), note: z.string().trim().max(500).optional(), notify: z.boolean().default(false) });

/**
 * Shortlist students from the ranking. Only students who pass the eligibility rules can be shortlisted. The score and evidence at this moment are kept with each decision.
 * Shortlisting records and (if asked) invites; it does not select anyone: the drive's rounds and the people running them do that.
 */
export const POST = route<{ id: string }>(MATCH_ADMIN, async (req, s, { id }) => {
  const { jd, data } = await approvedJd(s.collegeId, id);
  const b = await parseBody(req, body);
  const ids = [...new Set(b.studentIds)];
  const el = new Map((await eligibilityRows(jd, data)).map((r) => [r.studentId, r]));
  const bad = ids.filter((x) => !el.get(x)?.eligible);
  if (bad.length) throw badRequest(`${bad.length} chosen student${bad.length === 1 ? " does" : "s do"} not pass the eligibility rules, so cannot be shortlisted`);
  const inputs = await loadInputsMany(s.collegeId, ids);
  let added = 0;
  for (const sid of ids) {
    const i = inputs.get(sid);
    if (!i) continue;
    const res = matchStudent(data, buildMaster(i));
    const snap = { weights: data.scoring, parameters: res.parameters, skills: res.skills, mandatory: res.mandatory, explanation: res.explanation, at: new Date().toISOString() };
    const r = await db.jdShortlist.createMany({ data: [{ collegeId: s.collegeId, jdId: id, studentId: sid, score: res.score, mandatoryStatus: res.mandatory.status, snapshot: snap as object, note: b.note, decidedById: s.userId }], skipDuplicates: true });
    added += r.count;
    if (r.count && b.notify) await notifyStudent(s.collegeId, sid, { type: "jd.shortlist", title: `You have been shortlisted for ${data.title} at ${data.company}`, body: jd.driveId ? "Apply from the open drives page before the deadline." : undefined, link: jd.driveId ? `/student/drives/${jd.driveId}` : "/student/drives" });
  }
  await audit(s, { action: "jd.shortlist", entity: "JobDescription", entityId: id, after: { requested: ids.length, added, notified: b.notify } });
  return { added, alreadyShortlisted: ids.length - added };
});
