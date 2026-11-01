import type { ApprovalAction } from "@/generated/prisma/client";
import type { Session } from "@/lib/auth/session";
import { addException } from "@/lib/ops/exceptions";
import { decideApplications } from "@/lib/ops/applications";
import { recordRoundResults } from "@/lib/ops/roundResults";
import { createOffer } from "@/lib/ops/offers";
import { sendBulkEmail } from "@/lib/ops/email";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** What actually runs when an approver approves. Each operation re-validates against current data. */
export const executors: Record<ApprovalAction, (s: Session, payload: any) => Promise<unknown>> = {
  OFFER_CREATE: (s, p) => createOffer(s, p.input),
  BULK_EMAIL: (s, p) => sendBulkEmail(s, p.input),
  BULK_STATUS_CHANGE: (s, p) => (p.kind === "applications" ? decideApplications(s, p.driveId, p.input) : recordRoundResults(s, p.driveId, p.roundId, p.results)),
  ELIGIBILITY_EXCEPTION: (s, p) => addException(s, p.driveId, p.input),
};
