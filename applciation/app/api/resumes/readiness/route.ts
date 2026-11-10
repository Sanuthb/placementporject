import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { departmentScope } from "@/lib/auth/session";
import { analyzeResume, type SectionData } from "@/lib/resume";
import type { ProfileSection } from "@/generated/prisma/client";

const query = z.object({ departmentId: z.uuid().optional(), batchId: z.uuid().optional() });

/** How many students have a ready resume (score 70+ and verified), overall and by department. */
export const GET = route({ module: "ONBOARDING" }, async (req, s) => {
  const q = parseQuery(req, query);
  const scope = departmentScope(s);
  const students = await db.student.findMany({
    where: { collegeId: s.collegeId, isActive: true, isArchived: false, participationStatus: "REGISTERED", ...scope, ...(q.departmentId && !scope.departmentId ? { departmentId: q.departmentId } : {}), batchId: q.batchId },
    select: { id: true, email: true, phone: true, departmentId: true, department: { select: { name: true } }, sections: { select: { section: true, status: true, data: true } } },
  });
  const by = new Map<string, { departmentId: string; name: string; total: number; ready: number }>();
  let ready = 0;
  const notReady: { studentId: string; score: number }[] = [];
  for (const st of students) {
    const data: SectionData = {};
    for (const x of st.sections) data[x.section as ProfileSection] = x.data as Record<string, unknown>;
    const a = analyzeResume({ email: st.email, phone: st.phone }, data, st.sections.some((x) => x.section === "RESUME" && x.status === "VERIFIED"));
    const row = by.get(st.departmentId) ?? by.set(st.departmentId, { departmentId: st.departmentId, name: st.department.name, total: 0, ready: 0 }).get(st.departmentId)!;
    row.total++;
    if (a.ready) { row.ready++; ready++; } else notReady.push({ studentId: st.id, score: a.score });
  }
  const approved = await db.resumeVersion.findMany({ where: { collegeId: s.collegeId, status: "APPROVED", studentId: { in: students.map((x) => x.id) } }, select: { studentId: true } });
  const withApproved = new Set(approved.map((a) => a.studentId)).size;
  return { withApprovedResume: withApproved, withApprovedResumePercent: students.length ? Math.round((withApproved / students.length) * 1000) / 10 : 0, total: students.length, ready, percentage: students.length ? Math.round((ready / students.length) * 1000) / 10 : 0, byDepartment: [...by.values()], lowestScores: notReady.sort((a, b) => a.score - b.score).slice(0, 25) };
});
