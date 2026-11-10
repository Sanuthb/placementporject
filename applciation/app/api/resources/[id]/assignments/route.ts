import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { RES_STAFF, assignedStudentIds, resourceOf } from "@/lib/resourceService";

const SKILL_KEYS = ["aptitude", "technical", "digital", "communication", "teamwork"];
const body = z.object({
  targetType: z.enum(["STUDENT", "DEPARTMENT", "BATCH", "GROUP", "SKILL_GAP", "MOCK_TEST"]), targetId: z.uuid().optional(), targetKey: z.enum(SKILL_KEYS as [string, ...string[]]).optional(),
  studentIds: z.array(z.uuid()).max(500).optional(), note: z.string().trim().max(500).optional(), dueAt: z.coerce.date().optional(),
});

/** Assigns an approved resource to students, a department, a batch, a preparation group, everyone with a weak area, or a mock test's takers. */
export const POST = route<{ id: string }>(RES_STAFF, async (req, s, { id }) => {
  const r = await resourceOf(s.collegeId, id);
  if (r.status !== "APPROVED") throw badRequest("Only an approved resource can be assigned");
  const b = await parseBody(req, body);
  if (r.visibility === "STAFF_ONLY") throw badRequest("This resource is staff-only. Change its visibility before assigning it");
  const targets: { targetType: typeof b.targetType; targetId: string | null; targetKey: string | null }[] = [];
  if (b.targetType === "STUDENT") {
    const ids = b.studentIds?.length ? b.studentIds : b.targetId ? [b.targetId] : [];
    if (!ids.length) throw badRequest("Choose at least one student");
    const ok = await db.student.findMany({ where: { id: { in: ids }, collegeId: s.collegeId, isArchived: false }, select: { id: true } });
    if (ok.length !== new Set(ids).size) throw badRequest("A chosen student was not found");
    ok.forEach((x) => targets.push({ targetType: "STUDENT", targetId: x.id, targetKey: null }));
  } else if (b.targetType === "SKILL_GAP") {
    if (!b.targetKey) throw badRequest("Choose the skill gap");
    targets.push({ targetType: "SKILL_GAP", targetId: null, targetKey: b.targetKey });
  } else {
    if (!b.targetId) throw badRequest("Choose who to assign it to");
    const found = b.targetType === "DEPARTMENT" ? await db.department.findFirst({ where: { id: b.targetId, collegeId: s.collegeId } })
      : b.targetType === "BATCH" ? await db.batch.findFirst({ where: { id: b.targetId, collegeId: s.collegeId } })
      : b.targetType === "GROUP" ? await db.learningProgramme.findFirst({ where: { id: b.targetId, collegeId: s.collegeId } })
      : await db.assessmentPaper.findFirst({ where: { id: b.targetId, collegeId: s.collegeId } });
    if (!found) throw badRequest("That target was not found");
    targets.push({ targetType: b.targetType, targetId: b.targetId, targetKey: null });
  }
  const existing = await db.resourceAssignment.findMany({ where: { resourceId: id } });
  const fresh = targets.filter((t) => !existing.some((e) => e.targetType === t.targetType && e.targetId === t.targetId && e.targetKey === t.targetKey));
  if (!fresh.length) return { added: 0, notified: 0 };
  await db.resourceAssignment.createMany({ data: fresh.map((t) => ({ ...t, resourceId: id, collegeId: s.collegeId, note: b.note, dueAt: b.dueAt, assignedById: s.userId })) });
  const reach = await assignedStudentIds(s.collegeId, fresh);
  const had = await assignedStudentIds(s.collegeId, existing);
  const toTell = [...reach].filter((x) => !had.has(x)).slice(0, 2000);
  if (toTell.length) await db.notification.createMany({ data: toTell.map((studentId) => ({ collegeId: s.collegeId, studentId, type: "resource.assigned", title: `New study material for you: ${r.title}`, body: b.note, link: "/student/resources" })) });
  await audit(s, { action: "resource.assign", entity: "PrepResource", entityId: id, after: { targets: fresh.length, type: b.targetType, notified: toTell.length } });
  return { added: fresh.length, notified: toTell.length };
});
