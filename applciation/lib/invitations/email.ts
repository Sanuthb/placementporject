import { escapeHtml } from "@/lib/mailer";

export type InviteMail = {
  institution: string; studentName: string; admissionNumber: string; department: string; programme: string | null
  batch: string; graduationYear: number | null; link: string; expiresAt: Date
}

export const inviteSubject = (institution: string) => `Complete Your Student Registration – ${institution}`;
const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

/** The invitation email, as specified: plain text and HTML carry the same content. */
export function inviteBody(m: InviteMail) {
  const rows: [string, string][] = [
    ["Admission Number", m.admissionNumber],
    ["Department", m.department],
    ...(m.programme ? [["Programme", m.programme] as [string, string]] : []),
    ["Batch", m.batch],
    ...(m.graduationYear ? [["Expected Graduation Year", String(m.graduationYear)] as [string, string]] : []),
  ];
  const text = [
    `Dear ${m.studentName},`,
    "",
    `You have been invited by ${m.institution} to complete your student registration on the Student Development and Placement Management Portal.`,
    "",
    "Your assigned academic details:",
    "",
    ...rows.map(([k, v]) => `- ${k}: ${v}`),
    "",
    "Please use the secure link below to activate your account and complete your student profile.",
    "",
    `Complete Registration: ${m.link}`,
    "",
    `This invitation expires on ${fmt(m.expiresAt)}.`,
    "",
    "If you did not expect this invitation, please contact your institution.",
    "",
    "Regards,",
    m.institution,
  ].join("\n");

  const e = escapeHtml;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:560px">
<p>Dear ${e(m.studentName)},</p>
<p>You have been invited by <strong>${e(m.institution)}</strong> to complete your student registration on the Student Development and Placement Management Portal.</p>
<p>Your assigned academic details:</p>
<ul>${rows.map(([k, v]) => `<li>${e(k)}: <strong>${e(v)}</strong></li>`).join("")}</ul>
<p>Please use the secure link below to activate your account and complete your student profile.</p>
<p><a href="${e(m.link)}" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Complete Registration</a></p>
<p>This invitation expires on <strong>${e(fmt(m.expiresAt))}</strong>.</p>
<p>If you did not expect this invitation, please contact your institution.</p>
<p>Regards,<br>${e(m.institution)}</p></div>`;
  return { text, html };
}
