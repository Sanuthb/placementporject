import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { scopedStudent } from "@/lib/verification";
import { expireStale } from "@/lib/invitations/service";

/** The invitation as staff see it: status, dates and email attempts. Never the token or link. */
export const GET = route<{ id: string }>({ module: "ONBOARDING" }, async (_req, s, { id }) => {
  await scopedStudent(s, id);
  await expireStale(s.collegeId);
  const inv = await db.studentInvitation.findUnique({
    where: { studentId: id },
    select: {
      id: true, invitedEmail: true, admissionNumber: true, admissionYear: true, graduationYear: true, status: true, expiresAt: true, sentAt: true, acceptedAt: true, lastResentAt: true, resendCount: true, revokedAt: true, createdAt: true,
      campus: { select: { name: true } },
      emails: { select: { id: true, kind: true, status: true, error: true, createdAt: true, sentAt: true, toEmail: true }, orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  return { invitation: inv };
});
