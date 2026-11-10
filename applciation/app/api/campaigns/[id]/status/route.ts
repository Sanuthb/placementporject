import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { CAMP_ADMIN, campaignOf, logEvent } from "@/lib/campaignService";
import { campaignProblems } from "@/lib/campaign";

/** ACTIVATE (needs a name, a deadline after the start and at least one candidate; invitations can then go out), COMPLETE, or CANCEL. */
export const POST = route<{ id: string }>(CAMP_ADMIN, async (req, s, { id }) => {
  const c = await campaignOf(s, id);
  const { action } = await parseBody(req, z.object({ action: z.enum(["ACTIVATE", "COMPLETE", "CANCEL"]) }));
  const members = await db.campaignMember.count({ where: { campaignId: id, status: { not: "REMOVED" } } });
  const to = { ACTIVATE: "ACTIVE", COMPLETE: "COMPLETED", CANCEL: "CANCELLED" }[action] as "ACTIVE" | "COMPLETED" | "CANCELLED";
  if (action === "ACTIVATE") {
    if (c.status !== "DRAFT") throw badRequest("Only a draft can be activated");
    const p = campaignProblems({ name: c.name, startsAt: c.startsAt, deadline: c.deadline, members, invited: 0 });
    if (p.length) throw badRequest(p[0], p);
  } else if (action === "COMPLETE" && c.status !== "ACTIVE") throw badRequest("Only an active campaign can be completed");
  else if (action === "CANCEL" && (c.status === "COMPLETED" || c.status === "CANCELLED")) throw badRequest("This campaign is already over");
  await db.prepCampaign.update({ where: { id }, data: { status: to } });
  await logEvent(id, { type: "STAFF", id: s.userId }, `campaign.${to.toLowerCase()}`);
  await audit(s, { action: `campaign.${to.toLowerCase()}`, entity: "PrepCampaign", entityId: id, before: { status: c.status }, after: { status: to } });
  return { status: to };
});
