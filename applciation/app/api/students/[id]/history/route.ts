import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { scopedStudent } from "@/lib/verification";

/** One timeline of everything that happened to a student: audit log entries and section review events. */
export const GET = route<{ id: string }>({ module: "ONBOARDING" }, async (_req, s, { id }) => {
  await scopedStudent(s, id);
  const [logs, events] = await Promise.all([
    db.auditLog.findMany({ where: { collegeId: s.collegeId, entity: "Student", entityId: id }, select: { id: true, action: true, reason: true, before: true, after: true, createdAt: true, actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.verificationEvent.findMany({ where: { studentId: id }, select: { id: true, section: true, action: true, comment: true, createdAt: true, actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  const items = [
    ...logs.map((l) => ({ id: l.id, at: l.createdAt, by: l.actor?.name ?? "Student or system", action: l.action, detail: l.reason, before: l.before, after: l.after })),
    ...events.map((e) => ({ id: e.id, at: e.createdAt, by: e.actor?.name ?? "Student", action: `section.${e.action.toLowerCase()}`, detail: [e.section, e.comment].filter(Boolean).join(": "), before: null, after: null })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  return { items };
});
