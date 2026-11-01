import { NextResponse } from "next/server";
import type { ApprovalAction, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import type { Session } from "@/lib/auth/session";
import { notifyStaff } from "@/lib/notify";

/**
 * Runs `run` now, unless the college requires approval for this action. In that case the request is
 * parked as PENDING and nothing is applied until an approver decides (spec rule 12.7).
 */
export async function gate<T>(s: Session, action: ApprovalAction, summary: string, payload: Prisma.InputJsonObject, run: () => Promise<T>): Promise<T | Response> {
  const settings = await db.collegeSettings.findUnique({ where: { collegeId: s.collegeId }, select: { approvalRequired: true } });
  if (!settings?.approvalRequired.includes(action)) return run();
  const req = await db.approvalRequest.create({ data: { collegeId: s.collegeId, action, summary, payload, requestedById: s.userId } });
  await audit(s, { action: "approval.request", entity: "ApprovalRequest", entityId: req.id, after: { action, summary } });
  await notifyStaff(s.collegeId, { type: "approval.requested", title: "Approval needed", body: summary, link: `/approvals/${req.id}`, roles: ["TPO_ADMIN"], excludeUserId: s.userId });
  return NextResponse.json({ data: { approvalRequired: true, approvalRequestId: req.id, status: "PENDING" } }, { status: 202 });
}
