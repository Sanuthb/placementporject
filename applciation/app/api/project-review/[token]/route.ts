import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest, notFound } from "@/lib/api/errors";
import { limitBy } from "@/lib/rateLimit";
import { db } from "@/lib/db";
import { hashToken, signedUrl } from "@/lib/projectService";
import { CRITERIA, scoreRubric, teamProgress, type RepoStats } from "@/lib/projects";
import { z } from "zod";

const submit = z.object({ scores: z.record(z.string(), z.number()), comments: z.string().trim().max(4000).optional(), individualMarks: z.record(z.uuid(), z.number().int().min(0).max(10)).optional() });

async function load(token: string) {
  const inv = await db.projectMentorInvite.findUnique({ where: { tokenHash: hashToken(token) }, include: { team: { include: { project: true, members: { include: { student: { select: { name: true } } } }, milestones: true, tasks: true, files: true, updates: { orderBy: { createdAt: "desc" }, take: 10 } } } } });
  if (!inv || inv.usedAt || inv.expiresAt < new Date() || inv.team.resultPublishedAt || inv.team.status === "FORMING") throw notFound("This review link is not valid any more");
  return inv;
}
const json = (data: unknown) => NextResponse.json({ data }, { headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } });

/** Public (no login): what an invited industry mentor needs to review one team. Names and work only; no contact details. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    await limitBy(req, { name: "mentor-review", max: 60, windowSec: 60 });
    const inv = await load((await ctx.params).token);
    const t = inv.team, stats = t.repoStats as RepoStats | null;
    return json({
      mentor: inv.name, project: { title: t.project.title, problemStatement: t.project.problemStatement, skills: t.project.skills }, team: t.name, status: t.status, summary: t.summary, repoUrl: t.repoUrl, commits: stats?.totalCommits ?? null,
      members: t.members.map((m) => ({ id: m.studentId, name: m.student.name, role: m.role })), progress: teamProgress(t.milestones, t.tasks), final: t.status === "SUBMITTED",
      updates: t.updates.map((u) => ({ text: u.text, createdAt: u.createdAt })), files: await Promise.all(t.files.map(async (f) => ({ title: f.title, fileName: f.fileName, url: await signedUrl(f.filePath) }))), criteria: CRITERIA,
    });
  } catch (e) { return toErrorResponse(e, req); }
}

/** Public: the mentor submits their review. The link works once. A review given while the team is still working is a progress review; after submission it is final. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    await limitBy(req, { name: "mentor-review-post", max: 20, windowSec: 600 });
    const inv = await load((await ctx.params).token);
    const b = await parseBody(req, submit);
    const sc = scoreRubric(b.scores);
    if ("error" in sc) throw badRequest(sc.error);
    const ids = new Set(inv.team.members.map((m) => m.studentId));
    if (Object.keys(b.individualMarks ?? {}).some((k) => !ids.has(k))) throw badRequest("An individual mark names someone who is not in the team");
    const claimed = await db.projectMentorInvite.updateMany({ where: { id: inv.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count === 0) throw notFound("This review link is not valid any more");
    await db.projectReview.create({ data: { teamId: inv.teamId, reviewerType: "INDUSTRY", reviewerName: inv.name, inviteId: inv.id, comments: b.comments, scores: b.scores, individualMarks: b.individualMarks ?? {}, percent: sc.percent, isFinal: inv.team.status === "SUBMITTED" } });
    return json({ ok: true });
  } catch (e) { return toErrorResponse(e, req); }
}
