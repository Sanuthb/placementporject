import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyStudent } from "@/lib/notify";

const body = z.object({ decision: z.enum(["APPROVE", "REJECT"]), comment: z.string().trim().max(1000).optional() }).refine((v) => v.decision === "APPROVE" || !!v.comment, { message: "A comment is required to reject a log", path: ["comment"] });

export const POST = route<{ id: string; logId: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "INTERNSHIPS" }, async (req, s, { id, logId }) => {
  const b = await parseBody(req, body);
  const i = await db.internship.findFirst({ where: { id, collegeId: s.collegeId }, select: { studentId: true } });
  if (!i) throw notFound("Internship not found");
  const status = b.decision === "APPROVE" ? "APPROVED" : "REJECTED";
  return db.$transaction(async (tx) => {
    const claim = await tx.workLog.updateMany({ where: { id: logId, internshipId: id, status: "SUBMITTED" }, data: { status, reviewComment: b.comment, reviewedById: s.userId } });
    if (claim.count === 0) throw new ApiError(409, "CONFLICT", "This log is not awaiting review");
    await audit(s, { action: `internship.log.${status.toLowerCase()}`, entity: "WorkLog", entityId: logId }, tx);
    await notifyStudent(s.collegeId, i.studentId, { type: "internship.log", title: `Your work log was ${status.toLowerCase()}`, body: b.comment }, tx);
    return { id: logId, status };
  });
});
