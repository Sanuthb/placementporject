import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError, badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyStudent } from "@/lib/notify";
import { hasRole } from "@/lib/auth/session";
import { internshipDetail, internshipOf } from "@/lib/internshipService";
import { STATUS_FROM, completionBlocked } from "@/lib/internships";

const R = { module: "INTERNSHIPS" as const, facultyOk: true };
const body = z.object({ status: z.enum(["ONGOING", "COMPLETED", "TERMINATED"]), note: z.string().trim().max(1000).optional(), overrideReason: z.string().trim().min(10, "Explain why in at least 10 characters").max(1000).optional() });

/** The internship with attendance, tasks, feedback, evaluations and what is still needed to complete it. Faculty see the ones they mentor. */
export const GET = route<{ id: string }>(R, async (_req, s, { id }) => {
  await internshipOf(s, id);
  return internshipDetail(id, "staff");
});

/**
 * Start (staff or the faculty mentor), complete or terminate (staff). Completing needs the end date reached, an evaluation, no log awaiting review and every task
 * approved; the placement admin can complete without these by giving a reason, which is kept on the record.
 */
export const PATCH = route<{ id: string }>(R, async (req, s, { id }) => {
  const i = await internshipOf(s, id);
  const { status, note, overrideReason } = await parseBody(req, body);
  if (status !== "ONGOING" && !hasRole(s, "TPO_ADMIN", "PLACEMENT_OFFICER")) throw new ApiError(403, "FORBIDDEN", "Only placement staff can complete or terminate an internship");
  let override: string | undefined;
  if (status === "COMPLETED") {
    const d = await internshipDetail(id, "staff");
    const blocked = completionBlocked(d.completionChecks).filter((c) => c.key !== "running");
    if (blocked.length) {
      if (!overrideReason) throw badRequest("This internship cannot be completed yet", blocked.map((c) => c.label));
      if (!hasRole(s, "TPO_ADMIN")) throw new ApiError(403, "FORBIDDEN", "Only the placement admin can complete an internship with checks unmet");
      override = `${overrideReason} (unmet: ${blocked.map((c) => c.key).join(", ")})`;
    }
  }
  return db.$transaction(async (tx) => {
    const claim = await tx.internship.updateMany({ where: { id, collegeId: s.collegeId, status: { in: STATUS_FROM[status] as never[] } }, data: { status, ...(status === "COMPLETED" ? { completedAt: new Date(), completionOverride: override ?? null } : {}) } });
    if (claim.count === 0) {
      if (!(await tx.internship.findFirst({ where: { id, collegeId: s.collegeId }, select: { id: true } }))) throw notFound("Internship not found");
      throw new ApiError(409, "CONFLICT", `This internship cannot move to ${status.toLowerCase()} from its current state`);
    }
    await audit(s, { action: `internship.${status.toLowerCase()}`, entity: "Internship", entityId: id, reason: override ?? note }, tx);
    if (status !== "ONGOING") await notifyStudent(s.collegeId, i.studentId, { type: "internship.status", title: status === "COMPLETED" ? "Your internship has been marked complete" : "Your internship was ended", body: note, link: "/student/internships" }, tx);
    return { id, status };
  });
});
