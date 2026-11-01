import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError, forbidden, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { sessionForUser } from "@/lib/auth/session";
import { executors } from "@/lib/approvals-registry";
import type { Prisma } from "@/generated/prisma/client";

const body = z.object({ decision: z.enum(["APPROVE", "REJECT", "SEND_BACK"]), comment: z.string().trim().max(1000).optional() })
  .refine((v) => v.decision === "APPROVE" || !!v.comment, { message: "A comment is required to reject or send back", path: ["comment"] });

/**
 * Approve runs the stored action as its requester, using current data. A requester cannot approve their own
 * request unless they are the college's only active admin. A failed run reverts the request to PENDING.
 */
export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN"] }, async (req, s, { id }) => {
  const { decision, comment } = await parseBody(req, body);
  const r = await db.approvalRequest.findFirst({ where: { id, collegeId: s.collegeId } });
  if (!r) throw notFound("Approval request not found");
  if (r.requestedById === s.userId && (await db.user.count({ where: { collegeId: s.collegeId, role: "TPO_ADMIN", isActive: true } })) > 1) throw forbidden("You cannot decide your own request; another admin must");

  const status = decision === "APPROVE" ? "APPROVED" : decision === "REJECT" ? "REJECTED" : "SENT_BACK";
  const claim = await db.approvalRequest.updateMany({ where: { id, status: "PENDING" }, data: { status, decidedById: s.userId, decisionComment: comment, decidedAt: new Date() } });
  if (claim.count === 0) throw new ApiError(409, "CONFLICT", "This request has already been decided");
  await audit(s, { action: `approval.${status.toLowerCase()}`, entity: "ApprovalRequest", entityId: id, after: { action: r.action }, reason: comment });
  if (decision !== "APPROVE") return { id, status };

  try {
    const requester = await sessionForUser(r.requestedById);
    const payload = r.payload as { input?: { approvalRequestId?: string } };
    if (r.action === "BULK_EMAIL" && payload.input) payload.input.approvalRequestId = id;
    const result = await executors[r.action](requester, payload);
    const json = JSON.parse(JSON.stringify(result ?? null)) as Prisma.InputJsonValue;
    await db.approvalRequest.update({ where: { id }, data: { executedAt: new Date(), result: json } });
    return { id, status, result };
  } catch (e) {
    const message = (e as Error).message;
    if (r.action === "BULK_EMAIL") {
      // Some emails may already be out, so the request stays approved and the error is recorded.
      await db.approvalRequest.update({ where: { id }, data: { executionError: message } });
    } else {
      await db.approvalRequest.update({ where: { id }, data: { status: "PENDING", decidedById: null, decidedAt: null, decisionComment: null, executionError: message } });
    }
    throw e;
  }
});
