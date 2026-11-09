import { route } from "@/lib/api/handler";
import { ApiError, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { scopedStudent } from "@/lib/verification";
import { rotateInvitation } from "@/lib/invitations/service";
import { inviteLink } from "@/lib/invitations/token";

/**
 * Only the hash of a token is stored, so an existing link cannot be read back. "Copy invitation link" therefore issues a new
 * active link (the previous one stops working), returns it once and records who asked. Nothing is emailed.
 */
export const POST = route<{ id: string }>({ limit: { name: "invite-link", max: 60, windowSec: 3600 }, roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (_req, s, { id }) => {
  await scopedStudent(s, id);
  const inv = await db.studentInvitation.findUnique({ where: { studentId: id }, select: { id: true, status: true } });
  if (!inv) throw notFound("This student has no invitation");
  if (inv.status === "ACCEPTED") throw new ApiError(409, "CONFLICT", "The student has already accepted this invitation");
  const issued = await db.$transaction(async (tx) => {
    const r = await rotateInvitation(tx, inv.id, s.collegeId);
    // The link is handed over by the staff member, so the invitation counts as sent.
    await tx.studentInvitation.update({ where: { id: inv.id }, data: { status: "SENT", sentAt: new Date() } });
    await tx.student.updateMany({ where: { id, userId: null }, data: { onboardingStatus: "INVITATION_SENT", inviteStatus: "SENT", invitedAt: new Date() } });
    await audit(s, { action: "student.invitation.link", entity: "Student", entityId: id, before: { status: inv.status } }, tx);
    return r;
  });
  const exp = await db.studentInvitation.findUniqueOrThrow({ where: { id: inv.id }, select: { expiresAt: true } });
  return { link: inviteLink(issued.token), expiresAt: exp.expiresAt };
});
