import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError, badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ProspectStage } from "@/generated/prisma/client";

const body = z.object({ stage: z.enum(ProspectStage), driveId: z.uuid().optional(), lostReason: z.string().trim().min(3).max(300).optional() });
const NEXT: Record<ProspectStage, ProspectStage[]> = {
  PROSPECT: ["IN_CONVERSATION", "LOST"], IN_CONVERSATION: ["PROSPECT", "DRIVE_SCHEDULED", "WON", "LOST"],
  DRIVE_SCHEDULED: ["IN_CONVERSATION", "WON", "LOST"], WON: [], LOST: ["PROSPECT"],
};

/** Moves a prospect along the pipeline. Scheduling a drive links one; winning a prospect creates (or links) the company record. */
export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "EMPLOYER_CRM" }, async (req, s, { id }) => {
  const b = await parseBody(req, body);
  const p = await db.prospect.findFirst({ where: { id, collegeId: s.collegeId } });
  if (!p) throw notFound("Prospect not found");
  if (!NEXT[p.stage].includes(b.stage)) throw new ApiError(409, "CONFLICT", `A ${p.stage.toLowerCase().replace("_", " ")} prospect cannot move to ${b.stage.toLowerCase().replace("_", " ")}`);
  if (b.stage === "LOST" && !b.lostReason) throw badRequest("A reason is required when marking a prospect lost");
  if (b.stage === "DRIVE_SCHEDULED" && !(b.driveId && (await db.drive.findFirst({ where: { id: b.driveId, collegeId: s.collegeId }, select: { id: true } })))) throw badRequest("Link the drive that was scheduled (driveId)");

  return db.$transaction(async (tx) => {
    let companyId = p.companyId;
    if (b.stage === "WON" && !companyId) {
      const existing = await tx.company.findFirst({ where: { collegeId: s.collegeId, name: { equals: p.companyName, mode: "insensitive" } } });
      companyId = existing?.id ?? (await tx.company.create({ data: { collegeId: s.collegeId, name: p.companyName, industry: p.industry, contacts: p.contactName ? [{ name: p.contactName, email: p.contactEmail ?? undefined, phone: p.contactPhone ?? undefined }] : [] } })).id;
    }
    const claim = await tx.prospect.updateMany({ where: { id, stage: p.stage }, data: { stage: b.stage, companyId, driveId: b.driveId ?? p.driveId, lostReason: b.stage === "LOST" ? b.lostReason : null } });
    if (claim.count === 0) throw new ApiError(409, "CONFLICT", "The prospect was changed by someone else; reload and retry");
    await tx.prospectActivity.create({ data: { prospectId: id, authorId: s.userId, kind: "STAGE_CHANGE", body: `${p.stage} to ${b.stage}${b.lostReason ? `: ${b.lostReason}` : ""}` } });
    await audit(s, { action: "prospect.stage", entity: "Prospect", entityId: id, before: { stage: p.stage }, after: { stage: b.stage } }, tx);
    return { id, stage: b.stage, companyId };
  });
});
