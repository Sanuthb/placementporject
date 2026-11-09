import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { departmentScope, isFacultyOnly } from "@/lib/auth/session";
import { facultyStudentWhere } from "@/lib/faculty";
import { progressOf } from "@/lib/roadmap";

const query = z.object({
  departmentId: z.uuid().optional(), batchId: z.uuid().optional(), programId: z.uuid().optional(),
  status: z.enum(["all", "behind", "on_track", "no_role", "not_started"]).default("all"),
  q: z.string().trim().max(80).optional(), limit: z.coerce.number().int().min(1).max(300).default(150),
});

/**
 * Roadmap progress across students, for placement staff (coordinators: their department) and faculty (their mentees and allocated
 * students). A student who has not opened their roadmap shows as "not started"; nothing is created by looking.
 */
export const GET = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER", "DEPARTMENT_COORDINATOR", "FACULTY"], module: "ONBOARDING" }, async (req, s) => {
  const f = parseQuery(req, query);
  const scope = isFacultyOnly(s) ? await facultyStudentWhere(s.collegeId, s.userId) : { collegeId: s.collegeId, isArchived: false, ...departmentScope(s) };
  const rows = await db.student.findMany({
    where: { AND: [scope, { isActive: true, participationStatus: "REGISTERED" }, { departmentId: f.departmentId, batchId: f.batchId, programId: f.programId }, f.q ? { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { enrollmentNo: { contains: f.q, mode: "insensitive" } }] } : {}] },
    select: {
      id: true, name: true, enrollmentNo: true, mentorId: true,
      department: { select: { name: true } }, batch: { select: { name: true } }, program: { select: { name: true } }, mentor: { select: { name: true } }, currentSemester: { select: { number: true } },
      roadmap: { select: { targetRole: true, totalSemesters: true, updatedAt: true, milestones: { where: { archivedAt: null }, select: { status: true, semester: true, phase: true } } } },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }], take: f.limit,
  });
  const all = rows.map((r) => {
    const cur = Math.min(r.roadmap?.totalSemesters ?? 99, Math.max(1, r.currentSemester?.number ?? 1));
    const p = r.roadmap ? progressOf(r.roadmap.milestones, cur) : null;
    return { id: r.id, name: r.name, enrollmentNo: r.enrollmentNo, department: r.department.name, batch: r.batch.name, programme: r.program?.name ?? null, mentor: r.mentor?.name ?? null, isMine: r.mentorId === s.userId, started: !!r.roadmap, targetRole: r.roadmap?.targetRole ?? null, percent: p?.percent ?? 0, done: p?.done ?? 0, total: p?.total ?? 0, overdue: p?.overdue.length ?? 0, currentSemester: r.currentSemester?.number ?? null, updatedAt: r.roadmap?.updatedAt ?? null };
  });
  const items = all.filter((r) => f.status === "all" || (f.status === "not_started" ? !r.started : f.status === "behind" ? r.started && r.overdue > 0 : f.status === "on_track" ? r.started && r.overdue === 0 : r.started && !r.targetRole));
  const started = all.filter((r) => r.started);
  return {
    items,
    summary: { students: all.length, started: started.length, notStarted: all.length - started.length, behind: started.filter((r) => r.overdue > 0).length, noRole: started.filter((r) => !r.targetRole).length, averagePercent: started.length ? Math.round(started.reduce((t, r) => t + r.percent, 0) / started.length) : null },
  };
});
