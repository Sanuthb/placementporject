import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { escapeHtml, fromAddress, mailer } from "@/lib/mailer";
import { PROJ_STAFF, hashToken, mentorLink, newInviteToken, teamOf } from "@/lib/projectService";

/**
 * Invites an industry mentor, who has no account, to review one team. They get a link that works once and expires in 14 days. The link is also returned so it
 * can be shared by hand when email is not set up. Anyone with the link can submit the review, so send it only to the mentor.
 */
export const POST = route<{ id: string; tid: string }>(PROJ_STAFF, async (req, s, { id, tid }) => {
  const { project, team } = await teamOf(s, id, tid);
  const b = await parseBody(req, z.object({ name: z.string().trim().min(2).max(120), email: z.email() }));
  if (team.status === "FORMING" || team.resultPublishedAt) throw badRequest("The team must be working or submitted, and its result not yet published");
  const token = newInviteToken();
  const inv = await db.projectMentorInvite.create({ data: { teamId: tid, collegeId: s.collegeId, name: b.name, email: b.email, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 14 * 86_400_000), createdById: s.userId } });
  const link = mentorLink(token);
  let emailed = false;
  try {
    const college = await db.college.findUniqueOrThrow({ where: { id: s.collegeId }, select: { name: true } });
    await mailer().sendMail({ from: fromAddress(), to: b.email, subject: `Please review a student project: ${project.title}`, html: `<p>Hello ${escapeHtml(b.name)},</p><p>${escapeHtml(college.name)} would value your review of the student project <b>${escapeHtml(project.title)}</b> (${escapeHtml(team.name)}). It takes a few minutes and needs no account:</p><p><a href="${link}">${link}</a></p><p>The link works once and expires in 14 days.</p>` });
    emailed = true;
  } catch { /* email not configured or failed: the link is returned instead */ }
  await audit(s, { action: "project.mentor_invite", entity: "Project", entityId: id, after: { teamId: tid, inviteId: inv.id, emailed } });
  return { inviteId: inv.id, link, emailed, expiresAt: inv.expiresAt };
});
