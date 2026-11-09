import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, badRequest, notFound } from "@/lib/api/errors";
import { AUTO, CATEGORIES, phaseOfSemester } from "@/lib/roadmap";
import { recordEvent, type Actor } from "@/lib/roadmapService";
import { MilestoneStatus } from "@/generated/prisma/client";

const text = (max: number) => z.string().trim().max(max);

export const roadmapPatch = z.object({ targetRole: text(80).nullable().optional(), careerGoal: text(500).nullable().optional() });
export const milestoneCreate = z.object({
  title: text(140).min(3, "Give the milestone a title (3+ characters)"), description: text(500).optional(), category: z.enum(CATEGORIES).default("PERSONAL"),
  semester: z.number().int().min(1).max(20), suggestionKey: z.string().max(120).optional(),
});
export const milestonePatch = z.object({ status: z.enum(MilestoneStatus).optional(), note: text(500).nullable().optional(), semester: z.number().int().min(1).max(20).optional(), title: text(140).min(3).optional(), description: text(500).nullable().optional() });
export const goalCreate = z.object({ title: text(140).min(3, "Give the goal a title (3+ characters)"), description: text(500).optional(), targetDate: z.coerce.date().optional() });
export const goalPatch = z.object({ title: text(140).min(3).optional(), description: text(500).nullable().optional(), targetDate: z.coerce.date().nullable().optional(), status: z.enum(["OPEN", "ACHIEVED", "DROPPED"]).optional() });

async function mine(studentId: string) {
  const r = await db.studentRoadmap.findUnique({ where: { studentId } });
  if (!r) throw notFound("Open your roadmap first");
  return r;
}
const inside = (semester: number, total: number) => { if (semester > total) throw badRequest(`Your programme has ${total} semesters`); };

/** Set the student's own goal and target role. */
export async function updateRoadmap(studentId: string, b: z.infer<typeof roadmapPatch>, a: Actor) {
  const r = await mine(studentId);
  return db.$transaction(async (tx) => {
    const u = await tx.studentRoadmap.update({ where: { id: r.id }, data: { ...(b.targetRole !== undefined ? { targetRole: b.targetRole || null } : {}), ...(b.careerGoal !== undefined ? { careerGoal: b.careerGoal || null } : {}) } });
    await recordEvent(tx, r, a, "roadmap.updated", { targetRole: b.targetRole, careerGoal: b.careerGoal !== undefined ? "changed" : undefined, before: { targetRole: r.targetRole } });
    return u;
  });
}

/** Add the student's own milestone, or accept a suggestion (which is then built from the server's own suggestion, never from client text). */
export async function addMilestone(studentId: string, b: z.infer<typeof milestoneCreate>, suggestion: { key: string; title: string; description: string; category: string; semester: number } | null, a: Actor) {
  const r = await mine(studentId);
  inside(b.semester, r.totalSemesters);
  if (b.suggestionKey && !suggestion) throw badRequest("That suggestion is no longer available");
  const semester = suggestion ? suggestion.semester : b.semester;
  const count = await db.roadmapMilestone.count({ where: { roadmapId: r.id, archivedAt: null } });
  if (count >= 120) throw badRequest("A roadmap can hold at most 120 milestones");
  return db.$transaction(async (tx) => {
    const m = await tx.roadmapMilestone.create({ data: { roadmapId: r.id, collegeId: r.collegeId, key: suggestion?.key ?? null, semester, phase: phaseOfSemester(semester, r.totalSemesters), category: suggestion?.category ?? b.category, title: suggestion?.title ?? b.title, description: suggestion?.description ?? b.description ?? null, source: suggestion ? "RECOMMENDED" : "CUSTOM", sortOrder: 1000 + count } });
    await recordEvent(tx, r, a, suggestion ? "milestone.accepted_suggestion" : "milestone.added", { milestoneId: m.id, title: m.title, semester });
    return m;
  });
}

type Planned = { data: Record<string, unknown>; changedStatus: boolean };
/**
 * What a change to a milestone is allowed to do, as a pure decision. Rules: a milestone ticked automatically from system data cannot be marked
 * done by the student (the system decides) but can be skipped or moved; the text of a standard milestone is fixed; the student's own and accepted
 * ones can be edited freely. Mentors and staff may confirm or reopen. Returns the fields to write; throws ApiError when not allowed.
 */
export function planMilestoneChange(m: { status: string; semester: number; source: string; auto: string | null }, b: z.infer<typeof milestonePatch>, a: Actor, total: number, now = new Date()): Planned {
  if (b.semester !== undefined) inside(b.semester, total);
  const isAuto = !!m.auto && !!AUTO[m.auto];
  if (a.actor === "STUDENT" && isAuto && b.status === "DONE") throw new ApiError(409, "CONFLICT", AUTO[m.auto!].how.replace(/^Done when/, "This is ticked automatically. It will be done when"));
  if (a.actor !== "STUDENT" && (b.semester !== undefined || b.title !== undefined || b.description !== undefined)) throw badRequest("A mentor or staff member can confirm or reopen a milestone, not rewrite or move the student's plan");
  if (m.source === "TEMPLATE" && (b.title !== undefined || b.description !== undefined)) throw badRequest("Only your own milestones can be renamed. You can skip this one or move it to another semester");
  const data: Record<string, unknown> = {};
  const changedStatus = b.status !== undefined && b.status !== m.status;
  if (changedStatus) {
    data.status = b.status;
    if (b.status === "DONE") { data.completedAt = now; data.completedBy = a.actor === "STUDENT" ? "STUDENT" : a.actor === "MENTOR" ? "MENTOR" : "STAFF"; } else if (m.status === "DONE") { data.completedAt = null; data.completedBy = null; }
  }
  if (b.note !== undefined) data.note = b.note || null;
  if (b.semester !== undefined && b.semester !== m.semester) { data.semester = b.semester; data.phase = phaseOfSemester(b.semester, total); }
  if (b.title !== undefined) data.title = b.title;
  if (b.description !== undefined) data.description = b.description || null;
  return { data, changedStatus };
}

export async function changeMilestone(studentId: string, id: string, b: z.infer<typeof milestonePatch>, a: Actor) {
  const r = await mine(studentId);
  return db.$transaction(async (tx) => {
    const m = await tx.roadmapMilestone.findFirst({ where: { id, roadmapId: r.id, archivedAt: null } });
    if (!m) throw notFound("Milestone not found");
    const { data, changedStatus } = planMilestoneChange(m, b, a, r.totalSemesters);
    if (!Object.keys(data).length) return m;
    const u = await tx.roadmapMilestone.update({ where: { id }, data });
    await recordEvent(tx, r, a, changedStatus ? `milestone.${b.status!.toLowerCase()}` : "milestone.changed", { milestoneId: id, title: m.title, from: { status: m.status, semester: m.semester }, to: { status: u.status, semester: u.semester } });
    return u;
  });
}

/** Remove one of the student's own (or accepted) milestones. Template ones are skipped instead, so the plan's shape stays visible. Archived, never deleted. */
export async function removeMilestone(studentId: string, id: string, a: Actor) {
  const r = await mine(studentId);
  return db.$transaction(async (tx) => {
    const m = await tx.roadmapMilestone.findFirst({ where: { id, roadmapId: r.id, archivedAt: null } });
    if (!m) throw notFound("Milestone not found");
    if (m.source === "TEMPLATE") throw badRequest("This milestone is part of the standard plan. Skip it instead of removing it");
    await tx.roadmapMilestone.update({ where: { id }, data: { archivedAt: new Date() } });
    await recordEvent(tx, r, a, "milestone.removed", { milestoneId: id, title: m.title });
    return { removed: true };
  });
}

export async function addGoal(studentId: string, b: z.infer<typeof goalCreate>, a: Actor) {
  const r = await mine(studentId);
  if ((await db.roadmapGoal.count({ where: { roadmapId: r.id, status: "OPEN" } })) >= 10) throw badRequest("Keep at most 10 open goals. Finish or drop one first");
  return db.$transaction(async (tx) => {
    const g = await tx.roadmapGoal.create({ data: { roadmapId: r.id, collegeId: r.collegeId, title: b.title, description: b.description ?? null, targetDate: b.targetDate ?? null } });
    await recordEvent(tx, r, a, "goal.added", { goalId: g.id, title: g.title });
    return g;
  });
}
export async function changeGoal(studentId: string, id: string, b: z.infer<typeof goalPatch>, a: Actor) {
  const r = await mine(studentId);
  return db.$transaction(async (tx) => {
    const g = await tx.roadmapGoal.findFirst({ where: { id, roadmapId: r.id } });
    if (!g) throw notFound("Goal not found");
    const u = await tx.roadmapGoal.update({ where: { id }, data: { ...(b.title !== undefined ? { title: b.title } : {}), ...(b.description !== undefined ? { description: b.description || null } : {}), ...(b.targetDate !== undefined ? { targetDate: b.targetDate } : {}), ...(b.status !== undefined ? { status: b.status, achievedAt: b.status === "ACHIEVED" ? new Date() : null } : {}) } });
    await recordEvent(tx, r, a, b.status && b.status !== g.status ? `goal.${b.status.toLowerCase()}` : "goal.changed", { goalId: id, title: g.title });
    return u;
  });
}
export async function removeGoal(studentId: string, id: string, a: Actor) {
  const r = await mine(studentId);
  return db.$transaction(async (tx) => {
    const g = await tx.roadmapGoal.findFirst({ where: { id, roadmapId: r.id } });
    if (!g) throw notFound("Goal not found");
    await tx.roadmapGoal.delete({ where: { id } });
    await recordEvent(tx, r, a, "goal.removed", { goalId: id, title: g.title });
    return { removed: true };
  });
}
