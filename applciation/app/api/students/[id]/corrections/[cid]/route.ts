import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { scopedStudent } from "@/lib/verification";
import { tellStudent } from "@/lib/invitations/notify";

const body = z.object({ status: z.enum(["APPROVED", "REJECTED"]) });

/** Mark a student's request to correct their assigned details as done (after staff fixed it) or declined. */
export const PATCH = route<{ id: string; cid: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (req, s, { id, cid }) => {
  await scopedStudent(s, id);
  const { status } = await parseBody(req, body);
  const r = await db.studentCorrectionRequest.updateMany({ where: { id: cid, studentId: id, collegeId: s.collegeId, status: "PENDING" }, data: { status, resolvedById: s.userId, resolvedAt: new Date() } });
  if (r.count === 0) throw new ApiError(404, "NOT_FOUND", "Request not found or already handled");
  await audit(s, { action: `student.correction.${status.toLowerCase()}`, entity: "Student", entityId: id, after: { requestId: cid } });
  const c = await db.studentCorrectionRequest.findUniqueOrThrow({ where: { id: cid }, select: { field: true } });
  await tellStudent(s.collegeId, id, status === "APPROVED"
    ? { type: "onboarding.correction", title: `Your correction request was completed (${c.field})`, body: "Check the assigned details on the first step of your onboarding." }
    : { type: "onboarding.correction", title: `Your correction request was not accepted (${c.field})`, body: "Contact the placement cell if you think this is a mistake." });
  return { status };
});
