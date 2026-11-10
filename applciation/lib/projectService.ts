import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import type { ModuleKey, Role } from "@/generated/prisma/client";
import { ApiError, badRequest, notFound } from "@/lib/api/errors";
import { hasRole, type Session } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { DocumentRejected } from "@/lib/documents";
import { sniffResource } from "@/lib/resources";
import { notifyStudent } from "@/lib/notify";
import { contributions, evaluate, parseGithub, summariseContributors, teamProgress, type RepoStats } from "@/lib/projects";

export const PROJ_BUCKET = "student-documents";
/** Staff and faculty routes. A faculty member sees and works only on projects they guide (see `scope`). */
export const PROJ_STAFF: { roles: Role[]; module: ModuleKey } = { roles: ["TPO_ADMIN", "PLACEMENT_OFFICER", "FACULTY"], module: "LEARNING" };
export const PROJ_ADMIN: { roles: Role[]; module: ModuleKey } = { roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "LEARNING" };

export const isStaff = (s: Session) => hasRole(s, "TPO_ADMIN", "PLACEMENT_OFFICER");
/** Placement staff see every project of the college; a faculty member only the ones they guide. */
export const scope = (s: Session) => (isStaff(s) ? { collegeId: s.collegeId } : { collegeId: s.collegeId, guideId: s.userId });

export async function projectOf(s: Session, id: string) {
  const p = await db.project.findFirst({ where: { id, ...scope(s) } });
  if (!p) throw notFound("Project not found");
  return p;
}
export async function teamOf(s: Session, projectId: string, teamId: string) {
  const project = await projectOf(s, projectId);
  const team = await db.projectTeam.findFirst({ where: { id: teamId, projectId } });
  if (!team) throw notFound("Team not found");
  return { project, team };
}

export const signedUrl = async (path: string) => (await supabaseAdmin().storage.from(PROJ_BUCKET).createSignedUrl(path, 3600)).data?.signedUrl ?? null;

/** Stores a project document or presentation: PDF, Word or PowerPoint, up to 20 MB, type read from the bytes. */
export async function storeProjectFile(collegeId: string, teamId: string, file: File) {
  const bytes = Buffer.from(await file.arrayBuffer());
  let info;
  try { info = sniffResource(bytes, file.name, file.type); } catch (e) { if (e instanceof DocumentRejected) throw badRequest(e.message); throw e; }
  if (info.kind !== "DOCUMENT") throw badRequest("Upload a PDF, Word or PowerPoint file");
  const path = `${collegeId}/projects/${teamId}/${randomUUID()}-${info.safeName}`;
  const up = await supabaseAdmin().storage.from(PROJ_BUCKET).upload(path, bytes, { contentType: info.mime });
  if (up.error) throw badRequest("Upload failed: " + up.error.message);
  return { filePath: path, fileName: file.name.slice(0, 200), mimeType: info.mime, sizeBytes: bytes.length };
}
export const removeProjectFile = async (path: string | null | undefined) => { if (path) await supabaseAdmin().storage.from(PROJ_BUCKET).remove([path]).catch(() => undefined); };

// ---- GitHub ----
const SYNC_GAP_MS = 5 * 60_000;

/** Reads commit counts for the team's public GitHub repository. At most once every five minutes per team; private or missing repositories give a clear message. */
export async function syncRepo(team: { id: string; repoUrl: string | null; repoSyncedAt: Date | null; repoStats: unknown }): Promise<{ stats: RepoStats | null; cached: boolean }> {
  const ref = team.repoUrl ? parseGithub(team.repoUrl) : null;
  if (!ref) throw badRequest("Add a GitHub repository link first (https://github.com/owner/name)");
  if (team.repoSyncedAt && Date.now() - team.repoSyncedAt.getTime() < SYNC_GAP_MS) return { stats: team.repoStats as RepoStats | null, cached: true };
  const headers: Record<string, string> = { accept: "application/vnd.github+json", "user-agent": "placement-platform", ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
  const get = async (path: string) => {
    let res: Response;
    try { res = await fetch(`https://api.github.com/repos/${ref.owner}/${ref.repo}${path}`, { headers, signal: AbortSignal.timeout(10_000) }); } catch { throw new ApiError(502, "GITHUB_FAILED", "GitHub did not respond. Try again in a moment"); }
    if (res.status === 404) throw badRequest("That repository was not found, or it is private. Only public repositories can be read");
    if (res.status === 403 || res.status === 429) throw new ApiError(429, "GITHUB_BUSY", "GitHub is limiting requests right now. Try again in a few minutes");
    if (!res.ok) throw new ApiError(502, "GITHUB_FAILED", "GitHub could not be read. Try again later");
    return res.json() as Promise<unknown>;
  };
  const repo = (await get("")) as { full_name?: string; pushed_at?: string | null };
  const raw = (await get("/contributors?per_page=50")) as { login?: unknown; contributions?: unknown; type?: unknown }[];
  const sum = summariseContributors(Array.isArray(raw) ? raw : []);
  const stats: RepoStats = { fullName: String(repo.full_name ?? `${ref.owner}/${ref.repo}`), pushedAt: repo.pushed_at ?? null, ...sum, fetchedAt: new Date().toISOString() };
  await db.projectTeam.update({ where: { id: team.id }, data: { repoStats: stats, repoSyncedAt: new Date() } });
  return { stats, cached: false };
}

// ---- the team workspace ----
type Audience = "student" | "staff";

/**
 * Everything about one team. Students do not see reviews (scores and comments) until the result is published; staff and the guide always do. Each member's
 * recorded work is shown separately from the team's, so a reviewer can tell who did what.
 */
export async function teamView(teamId: string, audience: Audience, viewerStudentId?: string) {
  const t = await db.projectTeam.findUniqueOrThrow({
    where: { id: teamId },
    include: {
      project: true,
      members: { include: { student: { select: { id: true, name: true, enrollmentNo: true, departmentId: true, department: { select: { name: true } } } } }, orderBy: { joinedAt: "asc" } },
      milestones: { orderBy: { sortOrder: "asc" } }, tasks: { orderBy: { createdAt: "asc" } }, updates: { orderBy: { createdAt: "desc" }, take: 60 }, files: { orderBy: { createdAt: "desc" } },
      reviews: { orderBy: { createdAt: "desc" } }, invites: { select: { id: true, name: true, email: true, expiresAt: true, usedAt: true, createdAt: true }, orderBy: { createdAt: "desc" } },
    },
  });
  const published = !!t.resultPublishedAt;
  const showReviews = audience === "staff" || published;
  const stats = t.repoStats as RepoStats | null;
  const work = t.members.map((m) => ({
    studentId: m.studentId, githubUsername: m.githubUsername,
    tasksDone: t.tasks.filter((x) => x.assigneeId === m.studentId && x.status === "DONE").length, tasksAssigned: t.tasks.filter((x) => x.assigneeId === m.studentId).length,
    updates: t.updates.filter((u) => u.studentId === m.studentId).length, files: t.files.filter((f) => f.uploadedByStudentId === m.studentId).length,
  }));
  const contrib = contributions(work, stats?.contributors ?? []);
  const result = showReviews ? evaluate(t.reviews.map((r) => ({ reviewerType: r.reviewerType, percent: r.percent, isFinal: r.isFinal, individualMarks: r.individualMarks as Record<string, number> })), t.members.map((m) => m.studentId)) : null;
  const name = new Map(t.members.map((m) => [m.studentId, m.student.name]));
  return {
    id: t.id, name: t.name, status: t.status, leaderId: t.leaderId, summary: t.summary, repoUrl: t.repoUrl, repoStats: stats, repoSyncedAt: t.repoSyncedAt, startedAt: t.startedAt, submittedAt: t.submittedAt,
    project: { id: t.project.id, title: t.project.title, problemStatement: t.project.problemStatement, type: t.project.type, skills: t.project.skills, dueAt: t.project.dueAt, minTeamSize: t.project.minTeamSize, maxTeamSize: t.project.maxTeamSize, status: t.project.status },
    progress: teamProgress(t.milestones, t.tasks),
    members: t.members.map((m) => ({ studentId: m.studentId, name: m.student.name, enrollmentNo: m.student.enrollmentNo, department: m.student.department.name, departmentId: m.student.departmentId, githubUsername: m.githubUsername, role: m.role, showInPortfolio: m.showInPortfolio, isLeader: m.studentId === t.leaderId, isMe: m.studentId === viewerStudentId })),
    contributions: contrib.map((c) => ({ studentId: c.studentId, name: name.get(c.studentId) ?? "", tasksDone: c.tasksDone, tasksAssigned: c.tasksAssigned, updates: c.updates, files: c.files, commits: c.commits, sharePercent: c.sharePercent, lowContribution: audience === "staff" ? c.lowContribution : undefined })),
    milestones: t.milestones, tasks: t.tasks.map((x) => ({ ...x, assigneeName: x.assigneeId ? (name.get(x.assigneeId) ?? null) : null })),
    updates: t.updates.map((u) => ({ id: u.id, text: u.text, createdAt: u.createdAt, byStaff: !!u.authorUserId, author: u.studentId ? (name.get(u.studentId) ?? "Member") : "Faculty / staff" })),
    files: await Promise.all(t.files.map(async ({ filePath, ...f }) => ({ ...f, url: await signedUrl(filePath) }))),
    reviews: showReviews ? t.reviews.map((r) => ({ id: r.id, reviewerType: r.reviewerType, reviewerName: r.reviewerName, comments: r.comments, scores: r.scores, individualMarks: r.individualMarks, percent: r.percent, isFinal: r.isFinal, createdAt: r.createdAt })) : [],
    invites: audience === "staff" ? t.invites : [],
    result: published ? { teamPercent: t.finalPercent, mine: viewerStudentId && result ? (result.members[viewerStudentId] ?? null) : null, members: audience === "staff" ? (result?.members ?? null) : null } : audience === "staff" && result ? { teamPercent: result.teamPercent, preview: true, mine: null, members: result.members } : null,
    resultPublished: published,
  };
}

/** Sets the result from the final reviews and tells the members. The team must have been submitted. */
export async function publishResult(teamId: string, collegeId: string) {
  const t = await db.projectTeam.findUniqueOrThrow({ where: { id: teamId }, include: { reviews: true, members: { select: { studentId: true } }, project: { select: { title: true } } } });
  if (t.status !== "SUBMITTED" && t.status !== "EVALUATED") throw badRequest("The team has not submitted its work yet");
  const r = evaluate(t.reviews.map((x) => ({ reviewerType: x.reviewerType, percent: x.percent, isFinal: x.isFinal, individualMarks: x.individualMarks as Record<string, number> })), t.members.map((m) => m.studentId));
  if (!r) throw badRequest("Add at least one final review before publishing the result");
  await db.projectTeam.update({ where: { id: teamId }, data: { status: "EVALUATED", finalPercent: r.teamPercent, resultPublishedAt: new Date() } });
  await Promise.all(t.members.map((m) => notifyStudent(collegeId, m.studentId, { type: "project.result", title: `Your result for ${t.project.title} is published`, link: `/student/projects/team/${teamId}` })));
  return r;
}

// ---- industry mentor invitations ----
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
export const newInviteToken = () => randomBytes(32).toString("base64url");
export const mentorLink = (token: string) => `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/mentor-review/${token}`;

/** The portfolio of one student: finished project work with their own role and, once published, their own result. */
export async function portfolioFor(studentId: string, opts: { onlyShown?: boolean } = {}) {
  const ms = await db.projectMember.findMany({
    where: { studentId, ...(opts.onlyShown ? { showInPortfolio: true } : {}), team: { status: { in: ["SUBMITTED", "EVALUATED"] } } },
    include: { team: { include: { project: { select: { title: true, problemStatement: true, skills: true, type: true, industryPartner: true } }, members: { include: { student: { select: { name: true } } } }, reviews: true, tasks: { where: { assigneeId: studentId, status: "DONE" }, select: { id: true } } } } },
    orderBy: { joinedAt: "desc" },
  });
  return ms.map((m) => {
    const t = m.team;
    const r = t.resultPublishedAt ? evaluate(t.reviews.map((x) => ({ reviewerType: x.reviewerType, percent: x.percent, isFinal: x.isFinal, individualMarks: x.individualMarks as Record<string, number> })), t.members.map((x) => x.studentId)) : null;
    return { teamId: t.id, title: t.project.title, problem: t.project.problemStatement.slice(0, 400), type: t.project.type, skills: t.project.skills, industryPartner: t.project.industryPartner, teamName: t.name, teammates: t.members.filter((x) => x.studentId !== studentId).map((x) => x.student.name), myRole: m.role, tasksDone: t.tasks.length, summary: t.summary, repoUrl: t.repoUrl, submittedAt: t.submittedAt, myResultPercent: r?.members[studentId] ?? null, showInPortfolio: m.showInPortfolio };
  });
}
