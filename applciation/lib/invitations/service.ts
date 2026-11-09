import { after } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { fromAddress, mailer } from "@/lib/mailer";
import { inviteBody, inviteSubject } from "@/lib/invitations/email";
import { hashToken, inviteLink, newToken } from "@/lib/invitations/token";

type Tx = Prisma.TransactionClient;
export type Kind = "INVITE" | "RESEND" | "LINK";

/** Statuses in which a student has not yet accepted, so the invitation can still be (re)issued. */
export const OPEN_ONBOARDING = ["INVITATION_PENDING", "INVITATION_SENT", "INVITATION_EXPIRED"] as const;

export async function expiryFor(collegeId: string, client: Tx | typeof db = db) {
  const s = await client.collegeSettings.findUnique({ where: { collegeId }, select: { inviteExpiryDays: true } });
  return new Date(Date.now() + (s?.inviteExpiryDays ?? 7) * 86_400_000);
}

export type AssignedStructure = {
  campusId: string | null; departmentId: string; programId: string | null; branchId: string | null; batchId: string
  admissionYear: number | null; graduationYear: number | null
}

/** Creates the invitation row for a student. Returns the plaintext token, which exists only in memory from here to the email. */
export async function issueInvitation(tx: Tx, a: { collegeId: string; studentId: string; email: string; admissionNumber: string; createdById: string | null; expiresAt: Date; structure: AssignedStructure }) {
  const token = newToken();
  const inv = await tx.studentInvitation.create({
    data: { collegeId: a.collegeId, studentId: a.studentId, invitedEmail: a.email, admissionNumber: a.admissionNumber, ...a.structure, tokenHash: hashToken(token), expiresAt: a.expiresAt, createdById: a.createdById },
    select: { id: true },
  });
  return { invitationId: inv.id, token };
}

/** Replaces the token (the old link stops working at once) and restarts the expiry. */
export async function rotateInvitation(tx: Tx, invitationId: string, collegeId: string) {
  const token = newToken();
  const inv = await tx.studentInvitation.update({
    where: { id: invitationId },
    data: { tokenHash: hashToken(token), expiresAt: await expiryFor(collegeId, tx), status: "PENDING", revokedAt: null, failedAttempts: 0, lastResentAt: new Date(), resendCount: { increment: 1 } },
    select: { id: true, studentId: true },
  });
  await tx.student.updateMany({ where: { id: inv.studentId, userId: null }, data: { onboardingStatus: "INVITATION_PENDING" } });
  return { invitationId: inv.id, token };
}

/**
 * Sends one invitation email and records the outcome. Never throws: a mail failure leaves the invitation PENDING and the log row FAILED,
 * so staff can see it and resend. The log holds no token or link.
 */
export async function sendInvitationEmail(invitationId: string, token: string, kind: Kind): Promise<{ ok: boolean; error?: string }> {
  const inv = await db.studentInvitation.findUnique({
    where: { id: invitationId },
    include: {
      college: { select: { name: true } },
      student: { select: { id: true, name: true, email: true, enrollmentNo: true, department: { select: { name: true } }, program: { select: { name: true } }, batch: { select: { name: true, endYear: true } } } },
    },
  });
  if (!inv) return { ok: false, error: "Invitation not found" };
  const subject = inviteSubject(inv.college.name);
  const log = await db.invitationEmailLog.create({ data: { collegeId: inv.collegeId, invitationId, studentId: inv.studentId, toEmail: inv.invitedEmail, subject, kind }, select: { id: true } });
  try {
    const { text, html } = inviteBody({
      institution: inv.college.name, studentName: inv.student.name, admissionNumber: inv.admissionNumber, department: inv.student.department.name,
      programme: inv.student.program?.name ?? null, batch: inv.student.batch.name, graduationYear: inv.graduationYear ?? inv.student.batch.endYear,
      link: inviteLink(token), expiresAt: inv.expiresAt,
    });
    await mailer().sendMail({ from: fromAddress(), to: inv.invitedEmail, subject, text, html });
  } catch (e) {
    const error = ((e as Error).message ?? "Email could not be sent").slice(0, 300);
    await db.invitationEmailLog.update({ where: { id: log.id }, data: { status: "FAILED", error } });
    return { ok: false, error };
  }
  const now = new Date();
  await db.$transaction([
    db.invitationEmailLog.update({ where: { id: log.id }, data: { status: "SENT", sentAt: now } }),
    // A link that was copied or resent after acceptance, revocation or expiry must not revive the invitation, so only open ones move.
    db.studentInvitation.updateMany({ where: { id: invitationId, status: { in: ["PENDING", "SENT"] } }, data: { status: "SENT", sentAt: now } }),
    db.student.updateMany({ where: { id: inv.studentId, onboardingStatus: { in: [...OPEN_ONBOARDING] }, userId: null }, data: { onboardingStatus: "INVITATION_SENT", inviteStatus: "SENT", invitedAt: now } }),
  ]);
  return { ok: true };
}

/** Sends many invitations after the response has gone out, five at a time. Tokens are held in memory only. */
export function sendInBackground(items: { invitationId: string; token: string }[], kind: Kind) {
  if (!items.length) return;
  after(async () => {
    for (let i = 0; i < items.length; i += 5) {
      await Promise.all(items.slice(i, i + 5).map((x) => sendInvitationEmail(x.invitationId, x.token, kind).catch(() => undefined)));
    }
  });
}

/** Marks invitations past their expiry as expired. Cheap, and called wherever statuses are read or a link is used. */
export async function expireStale(collegeId?: string) {
  const stale = await db.studentInvitation.findMany({ where: { ...(collegeId ? { collegeId } : {}), status: { in: ["PENDING", "SENT"] }, expiresAt: { lt: new Date() } }, select: { id: true, studentId: true }, take: 1000 });
  if (!stale.length) return 0;
  await db.$transaction([
    db.studentInvitation.updateMany({ where: { id: { in: stale.map((s) => s.id) }, status: { in: ["PENDING", "SENT"] } }, data: { status: "EXPIRED" } }),
    db.student.updateMany({ where: { id: { in: stale.map((s) => s.studentId) }, userId: null, onboardingStatus: { in: ["INVITATION_PENDING", "INVITATION_SENT"] } }, data: { onboardingStatus: "INVITATION_EXPIRED" } }),
  ]);
  return stale.length;
}
