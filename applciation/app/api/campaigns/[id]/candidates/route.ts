import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody, parseQuery } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { CAMP_ADMIN, approvedJdFor, assertEditable, campaignOf, logEvent, reportOf } from "@/lib/campaignService";
import { eligibilityRows, runMatch } from "@/lib/matchingService";
import { matchStudent } from "@/lib/matching";
import { buildMaster } from "@/lib/resumeEngine";
import { loadInputsMany } from "@/lib/resumeService";

/**
 * Candidates the matching engine recommends (eligible, best score first), leaving out students already in this campaign. Filter by department and minimum score.
 * Students who do not pass the eligibility rules are not recommended; staff can still add them by hand.
 */
export const GET = route<{ id: string }>(CAMP_ADMIN, async (req, s, { id }) => {
  const q = parseQuery(req, z.object({ minScore: z.coerce.number().min(0).max(100).default(0), departmentId: z.uuid().optional() }));
  const c = await campaignOf(s, id);
  const { jd, data } = await approvedJdFor(c);
  const [r, members] = await Promise.all([runMatch(jd, data, { departmentId: q.departmentId }), db.campaignMember.findMany({ where: { campaignId: id, status: { not: "REMOVED" } }, select: { studentId: true } })]);
  const have = new Set(members.map((m) => m.studentId));
  return { truncated: r.truncated, candidates: r.candidates.filter((x) => !have.has(x.studentId) && x.score >= q.minScore) };
});

const body = z.object({ studentIds: z.array(z.uuid()).min(1).max(300), groupId: z.uuid().nullish() });

/**
 * Add students to the campaign. Students the matching engine recommends are added as selected; a student who does not pass the eligibility rules can still be added by hand
 * (marked as added manually). Each is stored with how they match the job today. Nothing is sent until you invite them.
 */
export const POST = route<{ id: string }>(CAMP_ADMIN, async (req, s, { id }) => {
  const c = await campaignOf(s, id);
  assertEditable(c);
  const b = await parseBody(req, body);
  const ids = [...new Set(b.studentIds)];
  if (b.groupId && !(await db.campaignGroup.findFirst({ where: { id: b.groupId, campaignId: id }, select: { id: true } }))) throw badRequest("Group not found");
  const { jd, data } = await approvedJdFor(c);
  const studs = await db.student.findMany({ where: { id: { in: ids }, collegeId: s.collegeId, isActive: true, isArchived: false }, select: { id: true } });
  if (studs.length !== ids.length) throw badRequest("A chosen student was not found or is inactive");
  const el = new Map((await eligibilityRows(jd, data)).map((r) => [r.studentId, r]));
  const existing = new Map((await db.campaignMember.findMany({ where: { campaignId: id, studentId: { in: ids } } })).map((m) => [m.studentId, m]));
  const inputs = await loadInputsMany(s.collegeId, ids);
  let added = 0, restored = 0, manual = 0;
  for (const sid of ids) {
    const i = inputs.get(sid);
    if (!i) continue;
    const res = matchStudent(data, buildMaster(i));
    const addedManually = !el.get(sid)?.eligible;
    const old = existing.get(sid);
    if (old && old.status !== "REMOVED") continue;
    if (old) { await db.campaignMember.update({ where: { id: old.id }, data: { status: "SELECTED", groupId: b.groupId ?? null, addedManually, scoreAtAdd: res.score, gapReport: reportOf(res) as object, invitedAt: null, respondedAt: null, declineReason: null } }); restored++; }
    else { await db.campaignMember.create({ data: { campaignId: id, studentId: sid, groupId: b.groupId ?? null, addedManually, scoreAtAdd: res.score, gapReport: reportOf(res) as object } }); added++; }
    if (addedManually) manual++;
  }
  await logEvent(id, { type: "STAFF", id: s.userId }, "candidates.added", { added, restored, manual });
  await audit(s, { action: "campaign.add_candidates", entity: "PrepCampaign", entityId: id, after: { added, restored, manual } });
  return { added: added + restored, addedManually: manual };
});
