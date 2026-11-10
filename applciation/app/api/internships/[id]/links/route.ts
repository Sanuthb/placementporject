import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { escapeHtml, fromAddress, mailer } from "@/lib/mailer";
import { feedbackLink, hashToken, internshipOf, newToken } from "@/lib/internshipService";

/**
 * Invites the company's mentor, who has no account, to evaluate the intern and give feedback. The link works once and expires in 21 days. It is returned so it can
 * be sent by hand when email is not set up. Anyone with the link can submit, so send it only to the mentor.
 */
export const POST = route<{ id: string }>({ module: "INTERNSHIPS", facultyOk: true }, async (req, s, { id }) => {
  const i = await internshipOf(s, id);
  const b = await parseBody(req, z.object({ name: z.string().trim().min(2).max(120), email: z.email() }));
  if (i.status === "TERMINATED") throw badRequest("This internship was ended");
  const token = newToken();
  const l = await db.internshipMentorLink.create({ data: { internshipId: id, collegeId: s.collegeId, name: b.name, email: b.email, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 21 * 86_400_000), createdById: s.userId } });
  const link = feedbackLink(token);
  let emailed = false;
  try {
    const [college, st] = await Promise.all([db.college.findUniqueOrThrow({ where: { id: s.collegeId }, select: { name: true } }), db.student.findUniqueOrThrow({ where: { id: i.studentId }, select: { name: true } })]);
    await mailer().sendMail({ from: fromAddress(), to: b.email, subject: `Please evaluate our intern: ${st.name}`, html: `<p>Hello ${escapeHtml(b.name)},</p><p>${escapeHtml(college.name)} would value your feedback on <b>${escapeHtml(st.name)}</b>, who interned with you as ${escapeHtml(i.role)}. It takes a few minutes and needs no account:</p><p><a href="${link}">${link}</a></p><p>The link works once and expires in 21 days.</p>` });
    emailed = true;
  } catch { /* the link is returned instead */ }
  await audit(s, { action: "internship.mentor_link", entity: "Internship", entityId: id, after: { linkId: l.id, emailed } });
  return { linkId: l.id, link, emailed, expiresAt: l.expiresAt };
});
