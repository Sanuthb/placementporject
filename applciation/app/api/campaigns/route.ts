import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { CAMP_ADMIN, CAMP_TRAINER, configSchema, isStaff, logEvent } from "@/lib/campaignService";
import { jdData } from "@/lib/jd";

/** Campaigns: staff see all, a trainer sees the ones they are assigned to. */
export const GET = route(CAMP_TRAINER, async (_req, s) => {
  const rows = await db.prepCampaign.findMany({ where: { collegeId: s.collegeId, ...(isStaff(s) ? {} : { trainerIds: { has: s.userId } }) }, orderBy: { createdAt: "desc" }, take: 100, include: { members: { select: { status: true } } } });
  return rows.map((c) => ({ id: c.id, name: c.name, company: c.company, jobRole: c.jobRole, status: c.status, startsAt: c.startsAt, deadline: c.deadline, jdId: c.jdId, members: c.members.filter((m) => m.status !== "REMOVED").length, accepted: c.members.filter((m) => m.status === "ACCEPTED").length }));
});

export const campaignFields = z.object({
  name: z.string().trim().min(3).max(150), description: z.string().trim().max(4000).nullish(), startsAt: z.coerce.date(), deadline: z.coerce.date(),
  trainerIds: z.array(z.uuid()).max(20).optional(), config: configSchema.optional(),
});

/** Start a campaign from an approved job description (an optional drive link is taken from it). It begins as a draft: add candidates, set the tests and interviews, then activate it. */
export const POST = route(CAMP_ADMIN, async (req, s) => {
  const b = await parseBody(req, campaignFields.extend({ jdId: z.uuid() }));
  const jd = await db.jobDescription.findFirst({ where: { id: b.jdId, collegeId: s.collegeId } });
  if (!jd || jd.status !== "APPROVED") throw badRequest("A campaign is made from an approved job description");
  if (b.deadline <= b.startsAt) throw badRequest("The deadline must be after the start date");
  const data = jdData.parse(jd.data);
  if (b.trainerIds?.length && (await db.user.count({ where: { id: { in: b.trainerIds }, collegeId: s.collegeId, isActive: true, OR: [{ role: "FACULTY" }, { extraRoles: { has: "FACULTY" } }, { role: { in: ["TPO_ADMIN", "PLACEMENT_OFFICER"] } }] } })) !== new Set(b.trainerIds).size) throw badRequest("A trainer must be an active faculty or placement staff member");
  const c = await db.prepCampaign.create({ data: { collegeId: s.collegeId, jdId: jd.id, driveId: jd.driveId, name: b.name, company: data.company || jd.companyName, jobRole: data.title || jd.title, description: b.description, ownerId: s.userId, startsAt: b.startsAt, deadline: b.deadline, trainerIds: b.trainerIds ?? [], config: (b.config ?? {}) as object } });
  await logEvent(c.id, { type: "STAFF", id: s.userId }, "campaign.created", { jdId: jd.id });
  await audit(s, { action: "campaign.create", entity: "PrepCampaign", entityId: c.id, after: { name: c.name, jdId: jd.id } });
  return { id: c.id };
});
