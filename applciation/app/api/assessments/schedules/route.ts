import { notifyStudent } from "@/lib/notify";
import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertDriveRefs } from "@/lib/drives";

const create = z.object({
  paperId: z.uuid(), title: z.string().trim().min(3).max(200), startsAt: z.coerce.date(), endsAt: z.coerce.date(), isBaseline: z.boolean().default(false), isPractice: z.boolean().default(false),
  maxAttempts: z.number().int().min(1).max(20).optional(), resultVisibility: z.enum(["SCORE_ONLY", "ANALYSIS", "AFTER_END", "IMMEDIATE"]).optional(),
  targetDepartmentIds: z.array(z.uuid()).max(100).default([]), targetBatchIds: z.array(z.uuid()).max(100).default([]),
}).refine((v) => v.endsAt > v.startsAt, { message: "endsAt must be after startsAt", path: ["endsAt"] });
const R = { roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] as ("TPO_ADMIN" | "PLACEMENT_OFFICER")[], module: "ASSESSMENTS" as const };

export const GET = route(R, (_req, s) => db.assessmentSchedule.findMany({ where: { collegeId: s.collegeId }, include: { paper: { select: { id: true, title: true, durationMin: true } }, _count: { select: { attempts: true } } }, orderBy: { startsAt: "desc" }, take: 100 }));

/** Schedules a paper for a window and audience. `isBaseline` marks a year-round baseline diagnostic. */
export const POST = route(R, async (req, s) => {
  const b = await parseBody(req, create);
  const paper = await db.assessmentPaper.findFirst({ where: { id: b.paperId, collegeId: s.collegeId } });
  if (!paper) throw badRequest("Paper not found");
  if (b.endsAt.getTime() - b.startsAt.getTime() < paper.durationMin * 60_000) throw badRequest("The window is shorter than the paper's duration");
  await assertDriveRefs(s.collegeId, { departmentIds: b.targetDepartmentIds, batchIds: b.targetBatchIds });
  const made = await db.$transaction(async (tx) => {
    const sch = await tx.assessmentSchedule.create({ data: { ...b, collegeId: s.collegeId, createdById: s.userId } });
    await audit(s, { action: "assessment.schedule", entity: "AssessmentSchedule", entityId: sch.id, after: { title: sch.title, isBaseline: sch.isBaseline } }, tx);
    return sch;
  });
  // Tell the students it is for. Personal practice sets are made by the student themselves, so only scheduled tests come through here.
  const who = await db.student.findMany({ where: { collegeId: s.collegeId, isActive: true, ...(b.targetDepartmentIds.length ? { departmentId: { in: b.targetDepartmentIds } } : {}), ...(b.targetBatchIds.length ? { batchId: { in: b.targetBatchIds } } : {}) }, select: { id: true }, take: 5000 });
  if (!b.isPractice) await Promise.all(who.map((w) => notifyStudent(s.collegeId, w.id, { type: "assessment.scheduled", title: `Test scheduled: ${made.title}`, body: `Opens ${made.startsAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST, closes ${made.endsAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST.`, link: `/student/assessments/${made.id}` }).catch(() => undefined)));
  return made;
});
