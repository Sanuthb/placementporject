import { db } from "@/lib/db";
import type { AlertEventKind, JobAlert } from "@/generated/prisma/client";

type Target = Pick<JobAlert, "collegeId" | "targetDepartmentIds" | "targetBatchIds" | "targetSkills">;

/** Skills are read from the verified SKILLS section: `{ skills: ["React", { name: "SQL" }] }`. */
export function skillNames(data: unknown): string[] {
  const list = (data as { skills?: unknown } | null)?.skills;
  return Array.isArray(list) ? list.map((x) => String(typeof x === "object" && x ? (x as { name?: unknown }).name : x).toLowerCase().trim()).filter(Boolean) : [];
}

/** Students who should see the alert: registered and active, matching department, batch and (if set) at least one skill. */
export async function alertAudience(t: Target) {
  const students = await db.student.findMany({
    where: {
      collegeId: t.collegeId, isActive: true, isArchived: false, participationStatus: "REGISTERED",
      ...(t.targetDepartmentIds.length ? { departmentId: { in: t.targetDepartmentIds } } : {}),
      ...(t.targetBatchIds.length ? { batchId: { in: t.targetBatchIds } } : {}),
    },
    select: { id: true, email: true, name: true, sections: t.targetSkills.length ? { where: { section: "SKILLS", status: "VERIFIED" }, select: { data: true } } : false },
  });
  if (!t.targetSkills.length) return students.map(({ id, email, name }) => ({ id, email, name }));
  const wanted = new Set(t.targetSkills.map((x) => x.toLowerCase().trim()));
  return students.filter((x) => skillNames((x as unknown as { sections: { data: unknown }[] }).sections[0]?.data).some((n) => wanted.has(n))).map(({ id, email, name }) => ({ id, email, name }));
}

/** For the student app: records that a student viewed or clicked an alert. */
export function recordAlertEvent(alertId: string, studentId: string, kind: AlertEventKind) {
  return db.jobAlertEvent.create({ data: { alertId, studentId, kind } });
}

/** Published alerts a given student should see (department, batch and skill targeting). */
export async function visibleAlertsFor(st: { id: string; collegeId: string; departmentId: string; batchId: string }) {
  const [alerts, skillsRow] = await Promise.all([
    db.jobAlert.findMany({ where: { collegeId: st.collegeId, status: "PUBLISHED" }, orderBy: { publishedAt: "desc" }, take: 200 }),
    db.studentSection.findFirst({ where: { studentId: st.id, section: "SKILLS", status: "VERIFIED" }, select: { data: true } }),
  ]);
  const mine = new Set(skillNames(skillsRow?.data));
  return alerts.filter((a) =>
    (!a.targetDepartmentIds.length || a.targetDepartmentIds.includes(st.departmentId)) &&
    (!a.targetBatchIds.length || a.targetBatchIds.includes(st.batchId)) &&
    (!a.targetSkills.length || a.targetSkills.some((k) => mine.has(k.toLowerCase().trim()))) &&
    (!a.deadline || a.deadline > new Date()),
  );
}
