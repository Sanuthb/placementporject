import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { CAMP_ADMIN, CAMP_TRAINER, assertEditable, campaignOf, configOf, dashboard, isStaff, logEvent } from "@/lib/campaignService";
import { campaignProblems } from "@/lib/campaign";
import { campaignFields } from "../route";

type P = { id: string };

/** The campaign with its dashboard (updated from what students have done), groups and every candidate's progress. */
export const GET = route<P>(CAMP_TRAINER, async (_req, s, { id }) => {
  const c = await campaignOf(s, id);
  const [d, groups, trainers] = await Promise.all([dashboard(c), db.campaignGroup.findMany({ where: { campaignId: id }, orderBy: { sortOrder: "asc" } }), db.user.findMany({ where: { id: { in: c.trainerIds } }, select: { id: true, name: true } })]);
  return {
    id: c.id, name: c.name, company: c.company, jobRole: c.jobRole, description: c.description, status: c.status, startsAt: c.startsAt, deadline: c.deadline, jdId: c.jdId, driveId: c.driveId, trainers, groups, config: configOf(c), canManage: isStaff(s),
    problems: campaignProblems({ name: c.name, startsAt: c.startsAt, deadline: c.deadline, members: d.members.filter((m) => m.status !== "REMOVED").length, invited: d.figures.invited }), ...d,
  };
});

/** Edit the campaign: name, description, dates, trainers and the schedule (mock tests, mock interviews, study material, milestones, notifications). */
export const PATCH = route<P>(CAMP_ADMIN, async (req, s, { id }) => {
  const c = await campaignOf(s, id);
  assertEditable(c);
  const b = await parseBody(req, campaignFields.partial());
  const start = b.startsAt ?? c.startsAt, end = b.deadline ?? c.deadline;
  if (end <= start) throw badRequest("The deadline must be after the start date");
  await db.prepCampaign.update({ where: { id }, data: { ...(b.name ? { name: b.name } : {}), ...(b.description !== undefined ? { description: b.description } : {}), startsAt: start, deadline: end, ...(b.trainerIds ? { trainerIds: b.trainerIds } : {}), ...(b.config ? { config: b.config as object } : {}) } });
  await logEvent(id, { type: "STAFF", id: s.userId }, "campaign.updated", { fields: Object.keys(b) });
  await audit(s, { action: "campaign.update", entity: "PrepCampaign", entityId: id, after: { fields: Object.keys(b) } });
  return { ok: true };
});

/** Delete a draft nobody has been invited to. Anything else is cancelled instead, so the record stays. */
export const DELETE = route<P>(CAMP_ADMIN, async (_req, s, { id }) => {
  const c = await campaignOf(s, id);
  if (c.status !== "DRAFT" || (await db.campaignMember.count({ where: { campaignId: id, status: { not: "SELECTED" } } })) > 0) throw badRequest("Only a draft with nobody invited can be deleted. Cancel the campaign instead");
  await db.prepCampaign.delete({ where: { id } });
  await audit(s, { action: "campaign.delete", entity: "PrepCampaign", entityId: id, before: { name: c.name } });
  return { ok: true };
});
