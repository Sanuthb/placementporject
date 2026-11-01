import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { gate } from "@/lib/approvals";
import { mailer } from "@/lib/mailer";
import { alertAudience } from "@/lib/jobAlerts";
import { sendBulkEmail } from "@/lib/ops/email";

const body = z.object({ notifyByEmail: z.boolean().default(false) });

/** Releases the alert to its target audience. With notifyByEmail the audience is also emailed (and that email may need approval). */
export const POST = route<{ id: string }>({ limit: { name: "publish-alert", max: 20, windowSec: 3600 }, roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (req, s, { id }) => {
  const { notifyByEmail } = await parseBody(req, body.default({ notifyByEmail: false }));
  const alert = await db.jobAlert.findFirst({ where: { id, collegeId: s.collegeId } });
  if (!alert) throw notFound("Job alert not found");
  if (notifyByEmail) mailer();
  const claim = await db.jobAlert.updateMany({ where: { id, status: "DRAFT" }, data: { status: "PUBLISHED", publishedAt: new Date() } });
  if (claim.count === 0) throw new ApiError(409, "CONFLICT", "Only draft alerts can be published");
  await audit(s, { action: "jobAlert.publish", entity: "JobAlert", entityId: id });

  const audience = await alertAudience(alert);
  if (!notifyByEmail || !audience.length) return { id, status: "PUBLISHED", audience: audience.length, emailed: null };
  const input = {
    purpose: "jobAlert", subject: `New opportunity: ${alert.title} at ${alert.companyName}`,
    body: `${alert.title} at ${alert.companyName}${alert.location ? ` (${alert.location})` : ""}\n\n${alert.description ?? ""}\n\nApply: ${alert.applyUrl}${alert.deadline ? `\nDeadline: ${alert.deadline.toUTCString()}` : ""}`.trim(),
    recipients: audience.map((x) => ({ email: x.email, studentId: x.id })),
  };
  const emailed = await gate(s, "BULK_EMAIL", `Email ${audience.length} students about the job alert "${alert.title}"`, { input }, () => sendBulkEmail(s, input));
  if (emailed instanceof Response) return emailed; // email is waiting for approval; the alert itself is already published
  return { id, status: "PUBLISHED", audience: audience.length, emailed };
});
