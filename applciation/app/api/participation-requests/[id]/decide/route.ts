import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

const body = z.object({ decision: z.enum(["APPROVED", "REJECTED"]), comment: z.string().trim().max(500).optional() });

export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (req, s, { id }) => {
  const { decision, comment } = await parseBody(req, body);
  const reqRow = await db.participationRequest.findFirst({ where: { id, collegeId: s.collegeId }, include: { student: true } });
  if (!reqRow) throw notFound("Request not found");
  return db.$transaction(async (tx) => {
    const claim = await tx.participationRequest.updateMany({ where: { id, status: "PENDING" }, data: { status: decision, decidedById: s.userId, decisionComment: comment, decidedAt: new Date() } });
    if (claim.count === 0) throw new ApiError(409, "CONFLICT", "This request has already been decided");
    if (decision === "APPROVED") {
      await tx.student.update({ where: { id: reqRow.studentId }, data: { participationStatus: reqRow.requestedStatus, participationReason: reqRow.reason } });
      await tx.participationHistory.create({ data: { collegeId: s.collegeId, studentId: reqRow.studentId, fromStatus: reqRow.student.participationStatus, toStatus: reqRow.requestedStatus, reason: reqRow.reason, changedById: s.userId } });
    }
    await audit(s, { action: `participationRequest.${decision.toLowerCase()}`, entity: "ParticipationRequest", entityId: id, reason: comment }, tx);
    return { id, status: decision };
  });
});
