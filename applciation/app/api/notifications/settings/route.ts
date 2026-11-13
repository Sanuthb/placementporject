import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { providerConfigured, dryRun, isOnHold, HOLD_REASON } from "@/lib/channels";

const body = z.object({ smsEnabled: z.boolean().optional(), whatsappEnabled: z.boolean().optional() });
const view = async (collegeId: string) => {
  const s = await db.collegeSettings.findUnique({ where: { collegeId }, select: { smsEnabled: true, whatsappEnabled: true } });
  return { smsEnabled: !!s?.smsEnabled, whatsappEnabled: !!s?.whatsappEnabled, providers: { SMS: providerConfigured("SMS"), WHATSAPP: providerConfigured("WHATSAPP") }, dryRun: dryRun(), onHold: { SMS: isOnHold("SMS"), WHATSAPP: isOnHold("WHATSAPP"), reason: isOnHold("SMS") ? HOLD_REASON : null } };
};

/** Whether text messages and WhatsApp are switched on for the college, and whether a sending service is configured. */
export const GET = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] }, (_req, s) => view(s.collegeId));
/** Switches SMS and WhatsApp on or off for the college. Students still have to opt in themselves. */
export const PUT = route({ roles: ["TPO_ADMIN"] }, async (req, s) => {
  const b = await parseBody(req, body);
  await db.collegeSettings.upsert({ where: { collegeId: s.collegeId }, create: { collegeId: s.collegeId, ...b }, update: b });
  await audit(s, { action: "notifications.channels", entity: "CollegeSettings", entityId: s.collegeId, after: b });
  return view(s.collegeId);
});
