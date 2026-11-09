import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { ProfileSection } from "@/generated/prisma/client";
import { expireStale } from "@/lib/invitations/service";
import { studentFilterQuery, studentWhere } from "@/lib/studentFilters";

type Slice = { id: string; name: string; count: number };

/** Headline numbers and breakdowns for Student Management. Follows the same filters and scope as the list. */
export const GET = route({ module: "ONBOARDING" }, async (req, s) => {
  const f = parseQuery(req, studentFilterQuery);
  const where = studentWhere(s, f);
  await expireStale(s.collegeId);
  const [settings, total, active, placed, byOnboarding, sentInvitations, byStage, byProgram, byDepartment, byBatch, pendingStudents, pendingDocs] = await Promise.all([
    db.collegeSettings.findUnique({ where: { collegeId: s.collegeId }, select: { requiredSections: true } }),
    db.student.count({ where }),
    db.student.count({ where: { ...where, isActive: true } }),
    db.student.count({ where: { ...where, isPlaced: true } }),
    db.student.groupBy({ by: ["onboardingStatus"], where, _count: { _all: true } }),
    db.student.count({ where: { ...where, invitation: { is: { sentAt: { not: null } } } } }),
    db.student.groupBy({ by: ["stage"], where, _count: { _all: true } }),
    db.student.groupBy({ by: ["programId"], where, _count: { _all: true } }),
    db.student.groupBy({ by: ["departmentId"], where, _count: { _all: true } }),
    db.student.groupBy({ by: ["batchId"], where, _count: { _all: true } }),
    db.student.count({ where: { ...where, documents: { some: { status: "PENDING" } } } }),
    db.studentDocument.count({ where: { collegeId: s.collegeId, status: "PENDING", student: where } }),
  ]);

  // Profile completion: how many of each student's required sections are verified, across everyone shown.
  const required = settings?.requiredSections?.length ? settings.requiredSections : Object.values(ProfileSection);
  const verified = total ? await db.studentSection.count({ where: { collegeId: s.collegeId, section: { in: required }, status: "VERIFIED", student: where } }) : 0;
  const completion = total ? Math.round((verified / (total * required.length)) * 100) : 0;

  const [programs, departments, batches] = await Promise.all([
    db.program.findMany({ where: { collegeId: s.collegeId }, select: { id: true, name: true } }),
    db.department.findMany({ where: { collegeId: s.collegeId }, select: { id: true, name: true } }),
    db.batch.findMany({ where: { collegeId: s.collegeId }, select: { id: true, name: true, endYear: true } }),
  ]);
  const named = (rows: { id: string; name: string }[]) => new Map(rows.map((r) => [r.id, r.name]));
  const slice = (groups: { key: string | null; n: number }[], names: Map<string, string>, none: string): Slice[] =>
    groups.map((g) => ({ id: g.key ?? "none", name: g.key ? names.get(g.key) ?? "Unknown" : none, count: g.n })).sort((a, b) => b.count - a.count);

  const batchYear = new Map(batches.map((b) => [b.id, b.endYear]));
  const byYear = new Map<number, number>();
  for (const g of byBatch) {
    const y = batchYear.get(g.batchId);
    if (y) byYear.set(y, (byYear.get(y) ?? 0) + g._count._all);
  }

  const ob = Object.fromEntries(byOnboarding.map((g) => [g.onboardingStatus, g._count._all])) as Record<string, number>;
  const n = (...k: string[]) => k.reduce((a, x) => a + (ob[x] ?? 0), 0);

  return {
    onboarding: {
      invitationsSent: sentInvitations,
      pendingAcceptance: n("INVITATION_SENT"),
      profileInProgress: n("INVITATION_ACCEPTED", "PROFILE_IN_PROGRESS", "CHANGES_REQUESTED"),
      pendingVerification: n("SUBMITTED", "VERIFICATION_IN_PROGRESS"),
      verified: n("VERIFIED"),
    },
    total, active, inactive: total - active, placed,
    completion, pendingDocs, pendingDocStudents: pendingStudents,
    stages: Object.fromEntries(byStage.map((g) => [g.stage, g._count._all])),
    byProgram: slice(byProgram.map((g) => ({ key: g.programId, n: g._count._all })), named(programs), "No programme"),
    byDepartment: slice(byDepartment.map((g) => ({ key: g.departmentId, n: g._count._all })), named(departments), "No department"),
    byBatch: slice(byBatch.map((g) => ({ key: g.batchId, n: g._count._all })), named(batches), "No batch"),
    byGraduationYear: [...byYear].sort((a, b) => a[0] - b[0]).map(([year, count]) => ({ id: String(year), name: String(year), count })),
  };
});
