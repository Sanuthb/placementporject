import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertDriveRefs } from "@/lib/drives";
import { DIFFICULTIES, DURATIONS, KINDS, KIND_LABEL, LANGUAGES, type Kind } from "@/lib/discussionEngine";
import { notifyStudent } from "@/lib/notify";

const R = { roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] as ("TPO_ADMIN" | "PLACEMENT_OFFICER")[], module: "ASSESSMENTS" as const };
const create = z.object({
  title: z.string().trim().min(3).max(150), kind: z.enum(KINDS.map(([k]) => k) as [Kind, ...Kind[]]), topic: z.string().trim().min(8).max(240), difficulty: z.enum(DIFFICULTIES).default("MEDIUM"),
  language: z.enum(LANGUAGES).default("English"), durationMin: z.number().int().refine((n) => (DURATIONS as readonly number[]).includes(n), "Choose 5, 10, 15 or 20 minutes").default(10),
  dueAt: z.coerce.date().optional(), targetDepartmentIds: z.array(z.uuid()).max(100).default([]), targetBatchIds: z.array(z.uuid()).max(100).default([]),
});

/** Sessions set up for students, with how many have started and finished them. */
export const GET = route(R, async (_req, s) => {
  const rows = await db.discussionAssignment.findMany({ where: { collegeId: s.collegeId }, orderBy: { createdAt: "desc" }, take: 100 });
  const g = await db.discussionSession.groupBy({ by: ["assignmentId", "status"], where: { assignmentId: { in: rows.map((r) => r.id) } }, _count: true });
  return rows.map((r) => ({ ...r, started: g.filter((x) => x.assignmentId === r.id).reduce((a, x) => a + x._count, 0), completed: g.find((x) => x.assignmentId === r.id && x.status === "COMPLETED")?._count ?? 0 }));
});

/** Sets up a discussion for a department or batch (or everyone). Students are told, and told that staff will see their reports. */
export const POST = route(R, async (req, s) => {
  const b = await parseBody(req, create);
  await assertDriveRefs(s.collegeId, { departmentIds: b.targetDepartmentIds, batchIds: b.targetBatchIds });
  const a = await db.discussionAssignment.create({ data: { ...b, collegeId: s.collegeId, createdById: s.userId } });
  await audit(s, { action: "discussion.assign", entity: "DiscussionAssignment", entityId: a.id, after: { title: a.title, kind: a.kind } });
  const who = await db.student.findMany({ where: { collegeId: s.collegeId, isActive: true, ...(b.targetDepartmentIds.length ? { departmentId: { in: b.targetDepartmentIds } } : {}), ...(b.targetBatchIds.length ? { batchId: { in: b.targetBatchIds } } : {}) }, select: { id: true }, take: 5000 });
  await Promise.all(who.map((w) => notifyStudent(s.collegeId, w.id, { type: "discussion.assigned", title: `Practice session: ${a.title}`, body: `${KIND_LABEL[b.kind]}, ${b.durationMin} minutes${a.dueAt ? `, by ${a.dueAt.toISOString().slice(0, 10)}` : ""}. The placement office will see your report.`, link: "/student/prep" }).catch(() => undefined)));
  return a;
});
