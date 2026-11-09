import { route } from "@/lib/api/handler";
import { ApiError, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { scopedStudent } from "@/lib/verification";

/** Makes the current link useless. It can be revived later by resending. */
export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (_req, s, { id }) => {
  await scopedStudent(s, id);
  const inv = await db.studentInvitation.findUnique({ where: { studentId: id }, select: { id: true, status: true } });
  if (!inv) throw notFound("This student has no invitation");
  if (inv.status === "ACCEPTED") throw new ApiError(409, "CONFLICT", "The student has already accepted this invitation");
  await db.$transaction(async (tx) => {
    const claim = await tx.studentInvitation.updateMany({ where: { id: inv.id, status: { in: ["PENDING", "SENT", "EXPIRED"] } }, data: { status: "REVOKED", revokedAt: new Date() } });
    if (claim.count === 0) throw new ApiError(409, "CONFLICT", "The invitation was accepted a moment ago");
    await audit(s, { action: "student.invitation.revoke", entity: "Student", entityId: id, before: { status: inv.status } }, tx);
  });
  return { status: "REVOKED" };
});
