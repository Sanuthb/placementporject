import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { CAMP_ADMIN, campaignOf, inviteMembers } from "@/lib/campaignService";
import { audit } from "@/lib/audit";

/** Invite selected candidates, a chosen few or all of them. Each gets a fresh skill gap report and a personal plan, and is told. The campaign must be active. */
export const POST = route<{ id: string }>({ ...CAMP_ADMIN, limit: { name: "campaign-invite", max: 30, windowSec: 3600 } }, async (req, s, { id }) => {
  const c = await campaignOf(s, id);
  if (c.status !== "ACTIVE") throw badRequest("Activate the campaign before inviting students");
  const b = await parseBody(req, z.object({ memberIds: z.array(z.uuid()).max(500).default([]) }));
  const r = await inviteMembers(c, b.memberIds, { id: s.userId });
  await audit(s, { action: "campaign.invite", entity: "PrepCampaign", entityId: id, after: r });
  return r;
});
