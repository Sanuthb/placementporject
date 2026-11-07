import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError, badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { scopedStudent } from "@/lib/verification";
import { resolveMapping } from "@/lib/academicMapping";
import { setLoginBlocked } from "@/lib/supabase-admin";

const body = z.object({
  kind: z.enum(["PROMOTED", "REPEATED", "ARREAR", "TRANSFERRED", "DISCONTINUED"]),
  semesterId: z.uuid().nullable().optional(),
  batchId: z.uuid().optional(),
  departmentId: z.uuid().optional(),
  programId: z.uuid().nullable().optional(),
  note: z.string().trim().max(500).optional(),
});

/** A student's full movement history, newest first. Rows are only ever added. */
export const GET = route<{ id: string }>({ module: "ONBOARDING" }, async (_req, s, { id }) => {
  await scopedStudent(s, id);
  const rows = await db.studentProgression.findMany({
    where: { studentId: id, collegeId: s.collegeId },
    include: { semester: { select: { name: true, batch: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  const [users, years] = await Promise.all([
    db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdById).filter((x): x is string => !!x))] } }, select: { id: true, name: true } }),
    db.academicYear.findMany({ where: { collegeId: s.collegeId, id: { in: [...new Set(rows.map((r) => r.academicYearId).filter((x): x is string => !!x))] } }, select: { id: true, name: true } }),
  ]);
  const who = new Map(users.map((u) => [u.id, u.name]));
  const yr = new Map(years.map((y) => [y.id, y.name]));
  return rows.map((r) => ({
    id: r.id, kind: r.kind, note: r.note, createdAt: r.createdAt,
    semester: r.semester?.name ?? null, batch: r.semester?.batch.name ?? null,
    academicYear: r.academicYearId ? yr.get(r.academicYearId) ?? null : null,
    by: r.createdById ? who.get(r.createdById) ?? null : null,
  }));
});

/**
 * Record a move. Every move adds a history row and none overwrites an earlier one. The student's batch and admission year
 * stay the same except for a transfer, which only an administrator may do.
 */
export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (req, s, { id }) => {
  const st = await scopedStudent(s, id);
  const b = await parseBody(req, body);
  if (!st.isActive) throw new ApiError(409, "CONFLICT", "This student is deactivated");
  if (b.kind === "TRANSFERRED" && s.role !== "TPO_ADMIN") throw new ApiError(403, "FORBIDDEN", "Only an administrator can transfer a student to another batch");
  if ((b.kind === "TRANSFERRED" || b.kind === "DISCONTINUED" || b.kind === "ARREAR") && !b.note) throw badRequest(b.kind === "ARREAR" ? "Say which subject or semester has the arrear" : "A reason is required");

  const result = await db.$transaction(async (tx) => {
    let batchId = st.batchId, semesterId = st.currentSemesterId, yearId = st.currentAcademicYearId;
    let mapped: Record<string, unknown> = {};

    if (b.kind === "PROMOTED" || b.kind === "REPEATED") {
      const target = b.semesterId ?? (b.kind === "REPEATED" ? st.currentSemesterId : null);
      if (!target) throw badRequest("Choose the semester");
      const sem = await tx.semester.findFirst({ where: { id: target, collegeId: s.collegeId, batchId: st.batchId } });
      if (!sem) throw badRequest("That semester does not belong to the student's batch");
      if (b.kind === "PROMOTED" && sem.id === st.currentSemesterId) throw badRequest("The student is already in that semester");
      semesterId = sem.id; yearId = sem.academicYearId ?? st.currentAcademicYearId;
    } else if (b.kind === "TRANSFERRED") {
      if (!b.batchId || b.batchId === st.batchId) throw badRequest("Choose a different batch to transfer to");
      const m = await resolveMapping(tx, s.collegeId, { departmentId: b.departmentId ?? st.departmentId, batchId: b.batchId, programId: b.programId ?? null, semesterId: b.semesterId ?? null });
      mapped = m; batchId = m.batchId; semesterId = m.currentSemesterId; yearId = m.currentAcademicYearId;
    }

    const moved = batchId !== st.batchId || semesterId !== st.currentSemesterId || yearId !== st.currentAcademicYearId;
    if (b.kind === "DISCONTINUED") await tx.student.update({ where: { id }, data: { isActive: false } });
    else if (moved) await tx.student.update({ where: { id }, data: { ...mapped, currentSemesterId: semesterId, currentAcademicYearId: yearId } });

    const row = await tx.studentProgression.create({ data: { collegeId: s.collegeId, studentId: id, semesterId, academicYearId: yearId, kind: b.kind, note: b.note ?? null, createdById: s.userId } });
    await audit(s, { action: `student.progression.${b.kind.toLowerCase()}`, entity: "Student", entityId: id, before: { batchId: st.batchId, semesterId: st.currentSemesterId }, after: { batchId, semesterId, note: b.note ?? null } }, tx);
    return row;
  });

  // Discontinuing also stops the login. Done after commit; a failure is reported, not hidden.
  if (b.kind === "DISCONTINUED" && st.userId) {
    try { await setLoginBlocked(st.userId, true); } catch { return { ...result, warning: "Recorded, but the student's login could not be blocked. Deactivate the account again to retry." }; }
  }
  return result;
});
