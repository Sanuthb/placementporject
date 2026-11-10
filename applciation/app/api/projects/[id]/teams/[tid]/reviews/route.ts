import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { PROJ_STAFF, teamOf } from "@/lib/projectService";
import { scoreRubric } from "@/lib/projects";

export const reviewBody = z.object({ scores: z.record(z.string(), z.number()), comments: z.string().trim().max(4000).optional(), individualMarks: z.record(z.uuid(), z.number().int().min(0).max(10)).optional(), isFinal: z.boolean().default(false) });

/**
 * A review of the team by its faculty guide (or placement staff): a 0-10 mark for each rubric criterion and comments, optionally marks for single students so
 * their result can differ from the team's. A final review needs the team to have submitted. Giving a final review again replaces your earlier one until the result is published.
 */
export const POST = route<{ id: string; tid: string }>(PROJ_STAFF, async (req, s, { id, tid }) => {
  const { project, team } = await teamOf(s, id, tid);
  const b = await parseBody(req, reviewBody);
  if (team.resultPublishedAt) throw badRequest("The result is already published");
  if (team.status === "FORMING") throw badRequest("The team has not started yet");
  if (b.isFinal && team.status !== "SUBMITTED") throw badRequest("A final review can be given once the team has submitted its work");
  const sc = scoreRubric(b.scores);
  if ("error" in sc) throw badRequest(sc.error);
  const members = new Set((await db.projectMember.findMany({ where: { teamId: tid }, select: { studentId: true } })).map((m) => m.studentId));
  if (Object.keys(b.individualMarks ?? {}).some((k) => !members.has(k))) throw badRequest("An individual mark names someone who is not in the team");
  const me = await db.user.findUniqueOrThrow({ where: { id: s.userId }, select: { name: true } });
  const type = project.guideId === s.userId ? "FACULTY" : "STAFF";
  const r = await db.$transaction(async (tx) => {
    if (b.isFinal) await tx.projectReview.deleteMany({ where: { teamId: tid, reviewerUserId: s.userId, isFinal: true } });
    return tx.projectReview.create({ data: { teamId: tid, reviewerType: type, reviewerName: me.name, reviewerUserId: s.userId, comments: b.comments, scores: b.scores, individualMarks: b.individualMarks ?? {}, percent: sc.percent, isFinal: b.isFinal } });
  });
  await audit(s, { action: "project.review", entity: "Project", entityId: id, after: { teamId: tid, percent: sc.percent, final: b.isFinal } });
  return { id: r.id, percent: r.percent };
});
