import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { expiryFor, issueInvitation, rotateInvitation, sendInBackground } from "@/lib/invitations/service";

const MAX = 200;
const body = z
  .object({
    mode: z.enum(["send", "resend"]).default("send"),
    studentIds: z.array(z.uuid()).max(MAX).optional(),
    batchId: z.uuid().optional(),
    departmentId: z.uuid().optional(),
  })
  .refine((v) => v.studentIds?.length || v.batchId || v.departmentId, { message: "Select students, a batch or a department" });

/**
 * Bulk send or resend. "send" invites students who have no invitation yet (for example ones added before invitations existed).
 * "resend" issues a fresh link to students who have not accepted. Emails go out after the response; failures can be retried.
 */
export const POST = route({ limit: { name: "invite", max: 20, windowSec: 3600 }, roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (req, s) => {
  const b = await parseBody(req, body);
  const pick = b.studentIds?.length ? { id: { in: b.studentIds } } : { batchId: b.batchId, departmentId: b.departmentId };
  const base = { collegeId: s.collegeId, isActive: true, isArchived: false, userId: null, ...pick };
  const students = await db.student.findMany({
    where: b.mode === "send" ? { ...base, invitation: { is: null } } : { ...base, invitation: { is: { status: { in: ["PENDING", "SENT", "EXPIRED", "REVOKED"] } } } },
    select: { id: true, email: true, enrollmentNo: true, campusId: true, departmentId: true, programId: true, branchId: true, batchId: true, admissionYear: true, invitation: { select: { id: true } }, batch: { select: { endYear: true } } },
    take: MAX + 1, orderBy: { id: "asc" },
  });
  if (!students.length) throw badRequest(b.mode === "send" ? "No students are waiting for an invitation" : "No invited students are waiting to accept");
  const chunk = students.slice(0, MAX);

  const items = await db.$transaction(async (tx) => {
    const expiresAt = await expiryFor(s.collegeId, tx);
    const out: { invitationId: string; token: string }[] = [];
    for (const st of chunk) {
      out.push(st.invitation
        ? await rotateInvitation(tx, st.invitation.id, s.collegeId)
        : await issueInvitation(tx, { collegeId: s.collegeId, studentId: st.id, email: st.email, admissionNumber: st.enrollmentNo, createdById: s.userId, expiresAt, structure: { campusId: st.campusId, departmentId: st.departmentId, programId: st.programId, branchId: st.branchId, batchId: st.batchId, admissionYear: st.admissionYear, graduationYear: st.batch.endYear } }));
    }
    await audit(s, { action: b.mode === "send" ? "student.invite.bulk" : "student.invite.resend.bulk", entity: "Student", after: { count: out.length } }, tx);
    return out;
  });
  sendInBackground(items, b.mode === "send" ? "INVITE" : "RESEND");
  return { queued: items.length, moreRemaining: students.length > MAX };
});
