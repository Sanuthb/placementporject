import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { hasRole } from "@/lib/auth/session";
import { notifyStaff } from "@/lib/notify";
import { nextJdState, reviewProblems, type JdAction, type JdState } from "@/lib/jd";
import { JD_ADMIN, dataOf, jdOf } from "@/lib/jdService";

const status: Record<JdState, "DRAFT" | "IN_REVIEW" | "APPROVED" | "ARCHIVED"> = { DRAFT: "DRAFT", IN_REVIEW: "IN_REVIEW", APPROVED: "APPROVED", ARCHIVED: "ARCHIVED" };

/** SUBMIT for review, APPROVE or REJECT (admin only; approving needs every check settled), REOPEN an approved one (admin, before its drive is live), ARCHIVE. */
export const POST = route<{ id: string }>(JD_ADMIN, async (req, s, { id }) => {
  const j = await jdOf(s.collegeId, id);
  const { action, note } = await parseBody(req, z.object({ action: z.enum(["SUBMIT", "APPROVE", "REJECT", "REOPEN", "ARCHIVE"]), note: z.string().trim().max(1000).optional() }));
  const drive = j.driveId ? await db.drive.findUnique({ where: { id: j.driveId }, select: { status: true } }) : null;
  const next = nextJdState(j.status as JdState, action as JdAction, { admin: hasRole(s, "TPO_ADMIN"), problems: reviewProblems(dataOf(j)), driveLive: !!drive && drive.status !== "DRAFT" && drive.status !== "CANCELLED", note });
  if ("error" in next) throw badRequest(next.error, action === "APPROVE" || action === "SUBMIT" ? reviewProblems(dataOf(j)) : undefined);
  const u = await db.jobDescription.update({ where: { id }, data: { status: status[next.state], reviewNote: action === "REJECT" ? note : action === "SUBMIT" ? null : j.reviewNote, ...(action === "SUBMIT" ? { submittedAt: new Date() } : {}), ...(action === "APPROVE" ? { approvedAt: new Date(), approvedById: s.userId, reviewNote: note ?? null } : {}), ...(action === "REOPEN" ? { approvedAt: null, approvedById: null } : {}) } });
  if (action === "SUBMIT") await notifyStaff(s.collegeId, { type: "jd.review", title: `Job description waiting for approval: ${j.title}`, link: `/staff/job-descriptions/${id}`, roles: ["TPO_ADMIN"], excludeUserId: s.userId });
  await audit(s, { action: `jd.${action.toLowerCase()}`, entity: "JobDescription", entityId: id, before: { status: j.status }, after: { status: u.status }, reason: note });
  return { status: u.status };
});
