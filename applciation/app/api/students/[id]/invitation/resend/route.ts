import { route } from "@/lib/api/handler";
import { ApiError, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { scopedStudent } from "@/lib/verification";
import { rotateInvitation, sendInvitationEmail } from "@/lib/invitations/service";

/** Issues a fresh link (the old one stops working) and emails it. Also revives a revoked or expired invitation. */
export const POST = route<{ id: string }>({ limit: { name: "invite-resend", max: 60, windowSec: 3600 }, roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (_req, s, { id }) => {
  await scopedStudent(s, id);
  const inv = await db.studentInvitation.findUnique({ where: { studentId: id }, select: { id: true, status: true } });
  if (!inv) throw notFound("This student has no invitation");
  if (inv.status === "ACCEPTED") throw new ApiError(409, "CONFLICT", "The student has already accepted this invitation");
  const issued = await db.$transaction(async (tx) => {
    const r = await rotateInvitation(tx, inv.id, s.collegeId);
    await audit(s, { action: "student.invitation.resend", entity: "Student", entityId: id, before: { status: inv.status } }, tx);
    return r;
  });
  const mail = await sendInvitationEmail(issued.invitationId, issued.token, "RESEND");
  return { emailSent: mail.ok, emailError: mail.error ?? null };
});
