import { route } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { newToken } from "@/lib/showcase";

/** Takes a profile offline (for example after a complaint). The old link is also invalidated. */
export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "TALENT_SHOWCASE" }, async (_req, s, { id }) => {
  const r = await db.showcaseProfile.updateMany({ where: { id, collegeId: s.collegeId }, data: { isEnabled: false, token: newToken() } });
  if (r.count === 0) throw notFound("Profile not found");
  await audit(s, { action: "showcase.revoke", entity: "ShowcaseProfile", entityId: id });
  return { id, isEnabled: false };
});
