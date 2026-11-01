import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyStudent } from "@/lib/notify";

const body = z.object({ decision: z.enum(["APPROVE", "REJECT"]), note: z.string().trim().max(500).optional() }).refine((v) => v.decision === "APPROVE" || !!v.note, { message: "Tell the student why it was rejected", path: ["note"] });

/** Approved experiences are shown to other students without the author's name. */
export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "STUDENT_PREP" }, async (req, s, { id }) => {
  const b = await parseBody(req, body);
  const status = b.decision === "APPROVE" ? "APPROVED" : "REJECTED";
  return db.$transaction(async (tx) => {
    const e = await tx.interviewExperience.findFirst({ where: { id, collegeId: s.collegeId, status: "PENDING" } });
    const claim = await tx.interviewExperience.updateMany({ where: { id, collegeId: s.collegeId, status: "PENDING" }, data: { status, moderatedById: s.userId, moderationNote: b.note } });
    if (claim.count === 0 || !e) throw new ApiError(409, "CONFLICT", "This experience is not awaiting moderation");
    await audit(s, { action: `experience.${status.toLowerCase()}`, entity: "InterviewExperience", entityId: id, reason: b.note }, tx);
    await notifyStudent(s.collegeId, e.studentId, { type: "experience.moderated", title: `Your interview experience was ${status.toLowerCase()}`, body: b.note }, tx);
    return { id, status };
  });
});
