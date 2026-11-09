import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { toErrorResponse } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { limitBy, rateLimit } from "@/lib/rateLimit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { expireStale } from "@/lib/invitations/service";
import { hashToken, looksLikeToken } from "@/lib/invitations/token";

const MAX_WRONG_EMAIL = 5;
const body = z.object({
  token: z.string().max(200),
  email: z.string().trim().toLowerCase().max(200),
  password: z.string().min(8, "Use at least 8 characters").max(128).regex(/[A-Za-z]/, "Include a letter").regex(/\d/, "Include a number"),
});
const INVALID = () => new ApiError(410, "INVITATION_INVALID", "This invitation link is not valid. Ask your placement cell to send a new one");

/**
 * Public. Accepting an invitation: the token must be live, the student must type the invited email, and a password is set.
 * The login and the student record are linked in one step, so there is never a second student or a login without a student.
 */
export async function POST(req: NextRequest) {
  let authUserId: string | null = null;
  try {
    await limitBy(req, { name: "invite-accept", max: 20, windowSec: 900 });
    const { token, email, password } = await parseBody(req, body);
    if (!looksLikeToken(token)) throw INVALID();
    const tokenHash = hashToken(token);
    await rateLimit({ name: "invite-accept-token", max: 10, windowSec: 900 }, tokenHash);
    await expireStale();

    const inv = await db.studentInvitation.findUnique({ where: { tokenHash }, include: { student: { select: { id: true, userId: true, name: true, email: true, isActive: true, isArchived: true } } } });
    if (!inv || inv.status === "REVOKED" || inv.status === "ACCEPTED" || inv.student.userId || !inv.student.isActive || inv.student.isArchived) throw INVALID();
    if (inv.status === "EXPIRED" || inv.expiresAt < new Date()) throw new ApiError(410, "INVITATION_EXPIRED", "This invitation has expired. Ask your placement cell to send a new one");
    if (inv.failedAttempts >= MAX_WRONG_EMAIL) throw new ApiError(423, "INVITATION_LOCKED", "Too many incorrect attempts. Ask your placement cell to send a new invitation");
    if (email !== inv.invitedEmail.toLowerCase()) {
      await db.studentInvitation.update({ where: { id: inv.id }, data: { failedAttempts: { increment: 1 } } });
      throw new ApiError(400, "EMAIL_MISMATCH", "That is not the email address this invitation was sent to");
    }

    const sb = supabaseAdmin();
    const created = await sb.auth.admin.createUser({ email: inv.invitedEmail, password, email_confirm: true, user_metadata: { studentId: inv.student.id } });
    if (created.error || !created.data.user) throw new ApiError(409, "ACCOUNT_EXISTS", "A login already exists for this email. Contact your placement cell");
    authUserId = created.data.user.id;
    const userId = authUserId;

    await db.$transaction(async (tx) => {
      // Single use: only one request can move the invitation out of PENDING/SENT.
      const claim = await tx.studentInvitation.updateMany({ where: { id: inv.id, tokenHash, status: { in: ["PENDING", "SENT"] }, expiresAt: { gt: new Date() } }, data: { status: "ACCEPTED", acceptedAt: new Date(), failedAttempts: 0 } });
      if (claim.count === 0) throw INVALID();
      const link = await tx.student.updateMany({ where: { id: inv.student.id, userId: null }, data: { userId, inviteStatus: "ACTIVATED", onboardingStatus: "INVITATION_ACCEPTED", lastActivityAt: new Date() } });
      if (link.count === 0) throw new ApiError(409, "CONFLICT", "This student already has an account");
      await tx.studentOnboardingProfile.upsert({ where: { studentId: inv.student.id }, update: {}, create: { collegeId: inv.collegeId, studentId: inv.student.id } });
      await audit({ collegeId: inv.collegeId, userId: null }, { action: "student.invitation.accept", entity: "Student", entityId: inv.student.id, after: { invitationId: inv.id } }, tx);
    });
    return NextResponse.json({ data: { accepted: true } });
  } catch (e) {
    // Do not leave a login behind when the student record could not be linked.
    if (authUserId) await supabaseAdmin().auth.admin.deleteUser(authUserId).catch(() => undefined);
    return toErrorResponse(e, req);
  }
}
