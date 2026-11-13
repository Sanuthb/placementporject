import { z } from "zod";
import { recruiterRoute, recruiterDrive } from "@/lib/api/recruiterHandler";
import { parseBody } from "@/lib/api/parse";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { recordRoundResults } from "@/lib/ops/roundResults";
import type { Session } from "@/lib/auth/session";

// The employer may move a shortlisted candidate of THEIR OWN company's drive through the rounds: clear them for the next round (or the last), or reject them.
// It reuses the placement office's own rules (recordRoundResults): shortlisted applicants only, the drive must be published, a student is judged for the round they are waiting for,
// and a student who already has an offer cannot be changed. The employer cannot mark attendance, record scores, make or revoke offers, or touch another company's drive.
const body = z.object({ results: z.array(z.object({ applicationId: z.uuid(), status: z.enum(["CLEARED", "REJECTED"]), remarks: z.string().trim().max(400).optional() })).min(1).max(50) }).strict();

export const POST = recruiterRoute<{ id: string; roundId: string }>(async (req, r, { id, roundId }) => {
  const { results } = await parseBody(req, body);
  await recruiterDrive(r, id); // own company's live or finished drive, else 404
  const company = (await db.company.findUnique({ where: { id: r.companyId }, select: { name: true } }))?.name ?? "company";
  // an employer is not a college user, so there is no user id to record: who acted is stamped into the remark and the audit entry
  const asEmployer = { userId: null, collegeId: r.collegeId } as unknown as Session;
  const stamped = results.map((x) => ({ ...x, remarks: `Recorded by ${r.name} (${company})${x.remarks ? `: ${x.remarks}` : ""}`.slice(0, 500) }));
  const out = await recordRoundResults(asEmployer, id, roundId, stamped);
  await audit({ collegeId: r.collegeId, userId: null }, { action: "round.results.employer", entity: "Drive", entityId: id, after: { recruiterId: r.recruiterId, companyId: r.companyId, roundId, updated: out.updated, failed: out.failed.length } });
  return out;
});
