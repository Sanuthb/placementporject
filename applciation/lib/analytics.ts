import { db } from "@/lib/db";
import { evaluateEligibility } from "@/lib/eligibility";
import { getDrive } from "@/lib/drives";
import { departmentScope, type Session } from "@/lib/auth/session";
import type { Prisma, RoundType } from "@/generated/prisma/client";

export type Filters = { year?: number; batchId?: string; departmentId?: string; programId?: string; includeHistorical?: boolean };
const pct = (p: number, t: number) => (t ? Math.round((p / t) * 1000) / 10 : 0);
const round2 = (n: number) => Math.round(n * 100) / 100;
export const placementYear = (o: { offerYear: number | null; offeredAt: Date }) => o.offerYear ?? o.offeredAt.getUTCFullYear();

export function packageStats(values: number[]) {
  if (!values.length) return { count: 0, highest: null, average: null, median: null };
  const v = [...values].sort((a, b) => a - b), mid = Math.floor(v.length / 2);
  return { count: v.length, highest: v[v.length - 1], average: round2(v.reduce((a, b) => a + b, 0) / v.length), median: v.length % 2 ? v[mid] : round2((v[mid - 1] + v[mid]) / 2) };
}

/** Department scope for coordinators, merged with any explicit department filter. */
function studentFilter(s: Session, f: Filters): Prisma.StudentWhereInput {
  const scope = departmentScope(s);
  return { departmentId: scope.departmentId ?? f.departmentId, batchId: f.batchId, programId: f.programId };
}

/** Placed vs total (registered students only), package statistics, companies visited and offers made. */
export async function overview(s: Session, f: Filters) {
  const sf = studentFilter(s, f);
  const registered: Prisma.StudentWhereInput = { collegeId: s.collegeId, isActive: true, isArchived: false, participationStatus: "REGISTERED", ...sf };
  const dims = ["departmentId", "batchId", "programId"] as const;
  const [depts, batches, programs, ...groups] = await Promise.all([
    db.department.findMany({ where: { collegeId: s.collegeId }, select: { id: true, name: true, code: true } }),
    db.batch.findMany({ where: { collegeId: s.collegeId }, select: { id: true, name: true } }),
    db.program.findMany({ where: { collegeId: s.collegeId }, select: { id: true, name: true, code: true } }),
    ...dims.flatMap((d) => [db.student.groupBy({ by: [d], where: registered, _count: true }), db.student.groupBy({ by: [d], where: { ...registered, isPlaced: true }, _count: true })]),
  ]);
  const table = (i: number, names: Map<string, string>, key: (typeof dims)[number]) => {
    const total = groups[i * 2] as unknown as Record<string, unknown>[], placed = groups[i * 2 + 1] as unknown as Record<string, unknown>[];
    return total.filter((t) => t[key] != null).map((t) => {
      const p = (placed.find((x) => x[key] === t[key])?._count as number) ?? 0, n = t._count as number;
      return { id: t[key] as string, name: names.get(t[key] as string) ?? "?", total: n, placed: p, percentage: pct(p, n) };
    }).sort((a, b) => a.name.localeCompare(b.name));
  };
  const placedCount = await db.student.count({ where: { ...registered, isPlaced: true } }), totalCount = await db.student.count({ where: registered });

  const offerRows = await db.offer.findMany({
    where: { collegeId: s.collegeId, student: sf, ...(f.includeHistorical === false ? { isHistorical: false } : {}) },
    select: { companyId: true, status: true, packageLpa: true, offerYear: true, offeredAt: true },
  });
  const inYear = offerRows.filter((o) => f.year === undefined || placementYear(o) === f.year);
  const accepted = inYear.filter((o) => o.status === "ACCEPTED");
  const drivesInYear = await db.drive.findMany({ where: { collegeId: s.collegeId, status: { in: ["PUBLISHED", "CLOSED"] } }, select: { companyId: true, driveDate: true } });
  const visited = new Set([...drivesInYear.filter((d) => f.year === undefined || d.driveDate.getUTCFullYear() === f.year).map((d) => d.companyId), ...accepted.map((o) => o.companyId)]);
  const made = inYear.filter((o) => o.status !== "REVOKED");

  return {
    filters: f,
    placement: { placed: placedCount, total: totalCount, percentage: pct(placedCount, totalCount) },
    byDepartment: table(0, new Map(depts.map((d) => [d.id, d.name])), "departmentId"),
    byBatch: table(1, new Map(batches.map((b) => [b.id, b.name])), "batchId"),
    byProgram: table(2, new Map(programs.map((p) => [p.id, p.name])), "programId"),
    packages: { unit: "LPA", ...packageStats(accepted.map((o) => Number(o.packageLpa))) },
    companies: { visited: visited.size },
    offers: { made: made.length, accepted: accepted.length, declined: inYear.filter((o) => o.status === "DECLINED").length, revoked: inYear.filter((o) => o.status === "REVOKED").length, pending: inYear.filter((o) => o.status === "OFFERED").length },
  };
}

/** Funnel for one drive: eligible, applied, attended, per round, offers; plus absentees and round-wise pass/reject counts. */
export async function driveAnalytics(s: Session, driveId: string) {
  const drive = await getDrive(s.collegeId, driveId);
  const scope = departmentScope(s);
  const studentIn: Prisma.StudentWhereInput = { ...scope };
  const [eligibleRows, apps, rounds, attendance, offers] = await Promise.all([
    evaluateEligibility(drive, scope.departmentId ? { departmentId: scope.departmentId } : {}),
    db.application.findMany({ where: { driveId, status: { not: "WITHDRAWN" }, student: studentIn }, select: { id: true, studentId: true, status: true, student: { select: { name: true, enrollmentNo: true } }, results: { select: { roundId: true, status: true } } } }),
    db.driveRound.findMany({ where: { driveId }, orderBy: { order: "asc" }, select: { id: true, order: true, type: true } }),
    db.attendanceRecord.findMany({ where: { driveId, student: studentIn }, select: { studentId: true, status: true, excused: true } }),
    db.offer.findMany({ where: { driveId, student: studentIn }, select: { status: true } }),
  ]);
  const presentIds = new Set(attendance.filter((a) => a.status === "PRESENT").map((a) => a.studentId));
  // A student counts as having attended if they were marked present or have any non-absent round result.
  const attended = apps.filter((a) => presentIds.has(a.studentId) || a.results.some((r) => r.status !== "ABSENT"));
  const attendedIds = new Set(attended.map((a) => a.studentId));
  const roundStats = rounds.map((r) => {
    const res = apps.flatMap((a) => a.results.filter((x) => x.roundId === r.id));
    const c = (st: string) => res.filter((x) => x.status === st).length;
    return { order: r.order, type: r.type, attended: c("ATTENDED") + c("CLEARED") + c("REJECTED"), absent: c("ABSENT"), cleared: c("CLEARED"), rejected: c("REJECTED"), passRate: pct(c("CLEARED"), c("CLEARED") + c("REJECTED")) };
  });
  const live = offers.filter((o) => o.status !== "REVOKED");
  return {
    drive: { id: drive.id, role: drive.role, status: drive.status },
    funnel: [
      { stage: "eligible", count: eligibleRows.filter((e) => e.eligible).length },
      { stage: "applied", count: apps.length },
      { stage: "attended", count: attended.length },
      ...roundStats.map((r) => ({ stage: `round ${r.order} (${r.type.toLowerCase().replace("_", " ")}) cleared`, count: r.cleared })),
      { stage: "offers", count: live.length },
      { stage: "accepted", count: live.filter((o) => o.status === "ACCEPTED").length },
    ],
    attendance: { attended: attended.length, notAttended: apps.length - attended.length },
    absentees: apps.filter((a) => !attendedIds.has(a.studentId)).map((a) => ({ studentId: a.studentId, name: a.student.name, enrollmentNo: a.student.enrollmentNo, excused: attendance.some((x) => x.studentId === a.studentId && x.excused) })),
    rounds: roundStats,
  };
}

export type EliminationFilters = { roundType?: RoundType; departmentId?: string; batchId?: string; driveId?: string };

async function rejections(s: Session, f: EliminationFilters) {
  const scope = departmentScope(s);
  return db.roundResult.findMany({
    where: {
      status: "REJECTED", round: { type: f.roundType, driveId: f.driveId, drive: { collegeId: s.collegeId } },
      application: { student: { ...scope, departmentId: scope.departmentId ?? f.departmentId, batchId: f.batchId } },
    },
    select: { applicationId: true, round: { select: { type: true, driveId: true } }, application: { select: { studentId: true, student: { select: { name: true, enrollmentNo: true, departmentId: true, batchId: true } } } } },
  });
}

/** Where students are eliminated: by round type, department and batch, plus students who keep failing the same round type. */
export async function elimination(s: Session, f: EliminationFilters) {
  const scope = departmentScope(s);
  const [rej, applied, depts, batches] = await Promise.all([
    rejections(s, f),
    db.application.groupBy({ by: ["studentId"], where: { drive: { collegeId: s.collegeId, id: f.driveId }, student: { ...scope, departmentId: scope.departmentId ?? f.departmentId, batchId: f.batchId } }, _count: true }),
    db.department.findMany({ where: { collegeId: s.collegeId }, select: { id: true, name: true } }),
    db.batch.findMany({ where: { collegeId: s.collegeId }, select: { id: true, name: true } }),
  ]);
  const count = <T,>(items: T[], key: (i: T) => string) => { const m = new Map<string, number>(); for (const i of items) m.set(key(i), (m.get(key(i)) ?? 0) + 1); return m; };
  const byType = count(rej, (r) => r.round.type);
  const total = rej.length;
  const dn = new Map(depts.map((d) => [d.id, d.name])), bn = new Map(batches.map((b) => [b.id, b.name]));
  const matrix = (idOf: (r: (typeof rej)[number]) => string, names: Map<string, string>) => {
    const types = new Set(rej.map((r) => r.round.type));
    const ids = new Set(rej.map(idOf));
    return [...ids].map((id) => ({ id, name: names.get(id) ?? "?", total: rej.filter((r) => idOf(r) === id).length, byRoundType: Object.fromEntries([...types].map((t) => [t, rej.filter((r) => idOf(r) === id && r.round.type === t).length])) }));
  };
  const perStudentType = new Map<string, { name: string; enrollmentNo: string; type: string; drives: Set<string> }>();
  for (const r of rej) {
    const k = `${r.application.studentId}|${r.round.type}`;
    const e = perStudentType.get(k) ?? perStudentType.set(k, { name: r.application.student.name, enrollmentNo: r.application.student.enrollmentNo, type: r.round.type, drives: new Set() }).get(k)!;
    e.drives.add(r.applicationId);
  }
  return {
    totalEliminations: total, studentsApplied: applied.length,
    byRoundType: [...byType.entries()].map(([roundType, n]) => ({ roundType, count: n, percentage: pct(n, total) })).sort((a, b) => b.count - a.count),
    mostCommonStopRound: [...byType.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    byDepartment: matrix((r) => r.application.student.departmentId, dn),
    byBatch: matrix((r) => r.application.student.batchId, bn),
    repeatFailures: [...perStudentType.entries()].filter(([, v]) => v.drives.size >= 2).map(([k, v]) => ({ studentId: k.split("|")[0], name: v.name, enrollmentNo: v.enrollmentNo, roundType: v.type, times: v.drives.size })).sort((a, b) => b.times - a.times),
  };
}

/** Click-through from any chart cell: the students behind a number. */
export async function eliminationStudents(s: Session, f: EliminationFilters) {
  const rej = await rejections(s, f);
  const seen = new Map<string, { studentId: string; name: string; enrollmentNo: string; times: number; roundTypes: Set<string> }>();
  for (const r of rej) {
    const e = seen.get(r.application.studentId) ?? seen.set(r.application.studentId, { studentId: r.application.studentId, name: r.application.student.name, enrollmentNo: r.application.student.enrollmentNo, times: 0, roundTypes: new Set() }).get(r.application.studentId)!;
    e.times++; e.roundTypes.add(r.round.type);
  }
  return [...seen.values()].map((e) => ({ ...e, roundTypes: [...e.roundTypes] })).sort((a, b) => b.times - a.times || a.name.localeCompare(b.name));
}
