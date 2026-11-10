import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertDriveRefs } from "@/lib/drives";
import { DIFFICULTIES, DURATIONS, INTERVIEW_TYPES, LANGUAGES, TYPE_LABEL, type InterviewType } from "@/lib/interviewEngine";
import { notifyStudent } from "@/lib/notify";

const R = { roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] as ("TPO_ADMIN" | "PLACEMENT_OFFICER")[], module: "ASSESSMENTS" as const };
const create = z.object({
  title: z.string().trim().min(3).max(150), type: z.enum(INTERVIEW_TYPES.map(([k]) => k) as [InterviewType, ...InterviewType[]]), mode: z.enum(["LEARNING", "ASSESSMENT"]),
  difficulty: z.enum(DIFFICULTIES).default("MEDIUM"), durationMin: z.number().int().refine((n) => (DURATIONS as readonly number[]).includes(n), "Choose 10, 15, 20, 30 or 45 minutes").default(20), language: z.enum(LANGUAGES).default("English"),
  role: z.string().trim().min(2).max(100), topic: z.string().trim().min(2).max(200), jdId: z.uuid().optional(), dueAt: z.coerce.date().optional(),
  targetDepartmentIds: z.array(z.uuid()).max(100).default([]), targetBatchIds: z.array(z.uuid()).max(100).default([]),
});

/** Interviews set up for students, with how many have started and finished them. */
export const GET = route(R, async (_req, s) => {
  const rows = await db.interviewAssignment.findMany({ where: { collegeId: s.collegeId }, orderBy: { createdAt: "desc" }, take: 100 });
  const g = await db.mockInterview.groupBy({ by: ["assignmentId", "status"], where: { assignmentId: { in: rows.map((r) => r.id) } }, _count: true });
  return rows.map((r) => ({ ...r, started: g.filter((x) => x.assignmentId === r.id).reduce((a, x) => a + x._count, 0), completed: g.find((x) => x.assignmentId === r.id && x.status === "COMPLETED")?._count ?? 0 }));
});

/** Sets up an interview for a department or batch (or everyone). Students are told, and they are told that staff will see their reports. */
export const POST = route(R, async (req, s) => {
  const b = await parseBody(req, create);
  await assertDriveRefs(s.collegeId, { departmentIds: b.targetDepartmentIds, batchIds: b.targetBatchIds });
  if (b.jdId && !(await db.jobDescription.count({ where: { id: b.jdId, collegeId: s.collegeId, status: "APPROVED" } }))) throw badRequest("Choose an approved job description");
  const a = await db.interviewAssignment.create({ data: { ...b, collegeId: s.collegeId, createdById: s.userId, targetStudentIds: [] } });
  await audit(s, { action: "interview.assign", entity: "InterviewAssignment", entityId: a.id, after: { title: a.title, type: a.type, mode: a.mode } });
  const who = await db.student.findMany({ where: { collegeId: s.collegeId, isActive: true, ...(b.targetDepartmentIds.length ? { departmentId: { in: b.targetDepartmentIds } } : {}), ...(b.targetBatchIds.length ? { batchId: { in: b.targetBatchIds } } : {}) }, select: { id: true }, take: 5000 });
  await Promise.all(who.map((w) => notifyStudent(s.collegeId, w.id, { type: "interview.assigned", title: `Interview to practise: ${a.title}`, body: `${TYPE_LABEL[b.type]}, ${b.durationMin} minutes${a.dueAt ? `, by ${a.dueAt.toISOString().slice(0, 10)}` : ""}. The placement office will see your report.`, link: "/student/prep" }).catch(() => undefined)));
  return a;
});
