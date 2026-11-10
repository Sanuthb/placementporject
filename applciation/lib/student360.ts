import { db } from "@/lib/db";
import { notFound } from "@/lib/api/errors";
import { departmentScope, type Session } from "@/lib/auth/session";
import { listOf } from "@/lib/resume";
import { ProfileSection, type ModuleKey } from "@/generated/prisma/client";
import { completionOf } from "@/lib/profileCompletionLoad";

type Academics = { cgpa?: number; tenthPercentage?: number; twelfthPercentage?: number; activeBacklogs?: number; semesters?: Record<string, unknown>[]; backlogHistory?: unknown[] };

export async function modulesOf(collegeId: string) {
  return new Set<ModuleKey>((await db.collegeModule.findMany({ where: { collegeId, enabled: true }, select: { module: true } })).map((m) => m.module));
}

export async function scopedFullStudent(s: Session, id: string) {
  const st = await db.student.findFirst({
    where: { id, collegeId: s.collegeId, ...departmentScope(s) },
    include: { department: { select: { id: true, name: true, code: true } }, batch: { select: { id: true, name: true } }, program: { select: { id: true, name: true } } },
  });
  if (!st) throw notFound("Student not found");
  return st;
}

/** Everything about one student in a single response. Parts that belong to modules the college has not bought are omitted. */
export async function student360(s: Session, id: string) {
  const [st, mods] = await Promise.all([scopedFullStudent(s, id), modulesOf(s.collegeId)]);
  const sections = await db.studentSection.findMany({ where: { studentId: id }, include: { documents: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true } } } });
  const acad = sections.find((x) => x.section === "ACADEMICS");
  const resume = sections.find((x) => x.section === "RESUME");

  const out: Record<string, unknown> = {
    profile: {
      id: st.id, name: st.name, enrollmentNo: st.enrollmentNo, email: st.email, phone: st.phone, department: st.department, batch: st.batch, program: st.program,
      stage: st.stage, participationStatus: st.participationStatus, participationReason: st.participationReason, inviteStatus: st.inviteStatus, isActive: st.isActive, isArchived: st.isArchived, isPlaced: st.isPlaced, placedTier: st.placedTier,
    },
    sections: Object.values(ProfileSection).map((name) => {
      const r = sections.find((x) => x.section === name);
      return { section: name, status: r?.status ?? "DRAFT", submittedAt: r?.submittedAt ?? null, reviewedAt: r?.reviewedAt ?? null, hasPendingRevision: !!r?.pendingData, reviewComment: r?.reviewComment ?? null };
    }),
    academics: acad ? { verified: acad.status === "VERIFIED", ...(acad.data as Academics), pendingRevision: !!acad.pendingData } : null,
    documents: sections.flatMap((x) => x.documents.map((d) => ({ ...d, section: x.section }))),
    resume: resume ? { status: resume.status, data: resume.data } : null,
    completion: await completionOf(s.collegeId, id),
  };

  if (mods.has("DRIVES")) {
    const apps = await db.application.findMany({
      where: { studentId: id },
      select: {
        id: true, status: true, appliedAt: true, currentRound: true, clearedAllRounds: true,
        drive: { select: { id: true, role: true, driveDate: true, status: true, company: { select: { id: true, name: true, tier: true } }, rounds: { select: { id: true, order: true, type: true }, orderBy: { order: "asc" } } } },
        results: { select: { roundId: true, status: true, score: true, remarks: true } },
      },
      orderBy: { appliedAt: "desc" },
    });
    const attendance = mods.has("ATTENDANCE_BLOCKING") ? await db.attendanceRecord.findMany({ where: { studentId: id }, select: { driveId: true, roundKey: true, status: true, excused: true } }) : [];
    const drives = apps.map(({ results, drive, ...a }) => ({
      ...a, drive: { id: drive.id, role: drive.role, driveDate: drive.driveDate, status: drive.status, company: drive.company },
      journey: drive.rounds.map((r) => {
        const res = results.find((x) => x.roundId === r.id), att = attendance.find((x) => x.driveId === drive.id && x.roundKey === r.id);
        return { round: r.order, type: r.type, result: res?.status ?? null, score: res?.score ?? null, remarks: res?.remarks ?? null, attendance: att ? { status: att.status, excused: att.excused } : null };
      }),
    }));
    const attendedDrive = (driveId: string) => attendance.some((x) => x.driveId === driveId && x.status === "PRESENT");
    out.drives = {
      summary: {
        applied: apps.length,
        attended: attendance.length ? new Set(attendance.filter((x) => x.status === "PRESENT").map((x) => x.driveId)).size : apps.filter((a) => a.results.some((r) => r.status !== "ABSENT")).length,
        absent: apps.filter((a) => attendance.some((x) => x.driveId === a.drive.id && x.status === "ABSENT") && !attendedDrive(a.drive.id)).length,
        cleared: apps.filter((a) => a.clearedAllRounds).length,
        rejected: apps.filter((a) => a.status === "REJECTED").length,
      },
      items: drives,
    };
    out.offers = await db.offer.findMany({ where: { studentId: id }, select: { id: true, role: true, packageLpa: true, status: true, isPpo: true, isHistorical: true, offerYear: true, offeredAt: true, respondedAt: true, joiningStatus: true, joiningDate: true, company: { select: { id: true, name: true, tier: true } } }, orderBy: { offeredAt: "desc" } });
  }
  if (mods.has("ATTENDANCE_BLOCKING")) {
    out.activeBlocks = await db.block.findMany({ where: { studentId: id, status: "ACTIVE", endsAt: { gt: new Date() } }, select: { id: true, source: true, reason: true, startsAt: true, endsAt: true } });
  }
  out.notes = await db.studentNote.findMany({ where: { studentId: id }, select: { id: true, body: true, createdAt: true, author: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 50 });
  out.timeline = await timeline(s.collegeId, id);
  return out;
}

type Ev = { at: Date; type: string; title: string; detail?: string | null; actor?: string | null };

/** All changes and actions for a student, newest first. */
export async function timeline(collegeId: string, studentId: string, limit = 100) {
  const [ver, apps, offers, part, blocks, audits] = await Promise.all([
    db.verificationEvent.findMany({ where: { studentId }, select: { createdAt: true, section: true, action: true, comment: true, actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 60 }),
    db.applicationEvent.findMany({ where: { application: { studentId } }, select: { createdAt: true, status: true, roundResult: true, note: true, application: { select: { drive: { select: { role: true, company: { select: { name: true } } } } } } }, orderBy: { createdAt: "desc" }, take: 80 }),
    db.offer.findMany({ where: { studentId }, select: { offeredAt: true, respondedAt: true, status: true, role: true, revokeReason: true, company: { select: { name: true } } } }),
    db.participationHistory.findMany({ where: { studentId }, select: { createdAt: true, fromStatus: true, toStatus: true, reason: true, changedBy: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.block.findMany({ where: { studentId }, select: { createdAt: true, liftedAt: true, reason: true, liftReason: true, source: true } }),
    db.auditLog.findMany({ where: { collegeId, entity: "Student", entityId: studentId }, select: { createdAt: true, action: true, reason: true, actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 40 }),
  ]);
  const ev: Ev[] = [
    ...ver.map((v) => ({ at: v.createdAt, type: `verification.${v.action.toLowerCase()}`, title: `${v.section.toLowerCase().replace("_", " ")}: ${v.action.toLowerCase().replace("_", " ")}`, detail: v.comment, actor: v.actor?.name })),
    ...apps.map((a) => ({ at: a.createdAt, type: "application", title: `${a.application.drive.company.name} (${a.application.drive.role}): ${(a.roundResult ?? a.status ?? "update").toString().toLowerCase().replace("_", " ")}`, detail: a.note })),
    ...offers.flatMap((o) => [
      { at: o.offeredAt, type: "offer.made", title: `Offer from ${o.company.name} (${o.role})`, detail: null },
      ...(o.respondedAt ? [{ at: o.respondedAt, type: `offer.${o.status.toLowerCase()}`, title: `Offer from ${o.company.name} ${o.status.toLowerCase()}`, detail: o.revokeReason }] : []),
    ]),
    ...part.map((p) => ({ at: p.createdAt, type: "participation", title: `Placement status: ${p.fromStatus ?? "none"} to ${p.toStatus}`.toLowerCase(), detail: p.reason, actor: p.changedBy?.name })),
    ...blocks.flatMap((b) => [{ at: b.createdAt, type: "block.created", title: `Blocked (${b.source.toLowerCase()})`, detail: b.reason }, ...(b.liftedAt ? [{ at: b.liftedAt, type: "block.lifted", title: "Block lifted", detail: b.liftReason }] : [])]),
    ...audits.map((a) => ({ at: a.createdAt, type: a.action, title: a.action, detail: a.reason, actor: a.actor?.name })),
  ];
  return ev.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

const norm = (v: unknown) => { const n = typeof v === "string" ? parseFloat(v) : (v as number); return Number.isFinite(n) ? (n <= 10 ? n * 10 : n) : null; }; // 0-10 scales become 0-100
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);

/**
 * Performance trend, comparison with peers, readiness and at-risk flags.
 * Semester entries are read as `{ semester, sgpa|gpa|percentage, subjects: [{ name, score|marks|percentage }] }`.
 */
export async function studentAnalysis(s: Session, id: string) {
  const [st, mods] = await Promise.all([scopedFullStudent(s, id), modulesOf(s.collegeId)]);
  const sections = await db.studentSection.findMany({ where: { studentId: id }, select: { section: true, status: true, data: true } });
  const acad = sections.find((x) => x.section === "ACADEMICS" && x.status === "VERIFIED")?.data as Academics | undefined;

  const semesters = (acad?.semesters ?? []).map((x, i) => ({ semester: Number(x.semester ?? i + 1), score: norm(x.sgpa ?? x.gpa ?? x.percentage), subjects: listOf(x, "subjects") as Record<string, unknown>[] }));
  const trend = semesters.filter((x) => x.score !== null).sort((a, b) => a.semester - b.semester).map((x) => ({ semester: x.semester, score: x.score as number }));
  const last = trend.at(-1), prev = trend.at(-2);
  const weak = semesters.flatMap((x) => x.subjects.map((sub) => ({ semester: x.semester, subject: String(sub.name ?? sub.subject ?? "?"), score: norm(sub.score ?? sub.marks ?? sub.percentage) }))).filter((x): x is { semester: number; subject: string; score: number } => x.score !== null && x.score < 50).sort((a, b) => a.score - b.score).slice(0, 5);

  const peers = await db.studentSection.findMany({ where: { collegeId: s.collegeId, section: "ACADEMICS", status: "VERIFIED", student: { isActive: true, isArchived: false } }, select: { data: true, student: { select: { batchId: true, departmentId: true } } } });
  const cg = (xs: typeof peers) => xs.map((p) => (p.data as Academics).cgpa).filter((v): v is number => typeof v === "number");
  const batchCg = cg(peers.filter((p) => p.student.batchId === st.batchId)), deptCg = cg(peers.filter((p) => p.student.departmentId === st.departmentId));
  const mine = acad?.cgpa;

  const assessments = mods.has("ASSESSMENTS")
    ? (await db.assessmentAttempt.findMany({ where: { studentId: id, status: { not: "IN_PROGRESS" }, reviewStatus: { not: "PENDING" }, score: { not: null } }, select: { score: true, maxScore: true, submittedAt: true, attemptNumber: true, schedule: { select: { title: true, isBaseline: true } } }, orderBy: { submittedAt: "desc" }, take: 20 }))
        .map((a) => ({ title: a.schedule.title, isBaseline: a.schedule.isBaseline, attemptNumber: a.attemptNumber, percent: Number(a.maxScore) ? Math.round((Number(a.score) / Number(a.maxScore)) * 1000) / 10 : 0, at: a.submittedAt }))
    : null;
  const [attendance, rejections, apps] = await Promise.all([
    mods.has("ATTENDANCE_BLOCKING") ? db.attendanceRecord.findMany({ where: { studentId: id }, select: { status: true, excused: true } }) : Promise.resolve([]),
    db.roundResult.findMany({ where: { status: "REJECTED", application: { studentId: id } }, select: { round: { select: { type: true } }, applicationId: true } }),
    db.application.count({ where: { studentId: id } }),
  ]);
  const present = attendance.filter((a) => a.status === "PRESENT").length, unexcused = attendance.filter((a) => a.status === "ABSENT" && !a.excused).length;
  const byType = new Map<string, Set<string>>();
  for (const r of rejections) (byType.get(r.round.type) ?? byType.set(r.round.type, new Set()).get(r.round.type)!).add(r.applicationId);
  const unfilled = (await completionOf(s.collegeId, id)).missing.map((m) => m.label.toLowerCase());
  const skills = listOf(sections.find((x) => x.section === "SKILLS" && x.status === "VERIFIED")?.data, "skills");

  return {
    performance: { semesterTrend: trend, latest: last ?? null, change: last && prev ? Math.round((last.score - prev.score) * 100) / 100 : null, direction: last && prev ? (last.score > prev.score ? "improving" : last.score < prev.score ? "declining" : "steady") : null, weakSubjects: weak },
    comparison: {
      cgpa: mine ?? null,
      batchAverage: avg(batchCg), departmentAverage: avg(deptCg),
      batchPercentile: mine !== undefined && batchCg.length ? Math.round((batchCg.filter((v) => v <= mine).length / batchCg.length) * 100) : null,
    },
    readiness: {
      assessmentScores: assessments,
      skillsVerified: skills.length,
      drivesApplied: apps,
      drivesAttended: attendance.length ? present : null,
      attendanceRate: attendance.length ? Math.round((present / attendance.length) * 100) : null,
    },
    // Only whether the assessment is done. Scores are the student's own; staff open them case by case (logged) via /api/psychometrics.
    personalityProfile: mods.has("PSYCHOMETRICS") ? { completed: !!(await db.psychAttempt.findFirst({ where: { studentId: id, isCurrent: true }, select: { id: true } })), note: "Individual results are available to the student; staff access is limited and logged" } : null,
    atRisk: {
      flags: [
        ...(attendance.length >= 3 && present / attendance.length < 0.5 ? [{ flag: "LOW_DRIVE_ATTENDANCE", detail: `Attended ${present} of ${attendance.length} sessions` }] : []),
        ...(unexcused >= 2 ? [{ flag: "REPEATED_ABSENCES", detail: `${unexcused} unexcused absences` }] : []),
        ...[...byType.entries()].filter(([, apps]) => apps.size >= 2).map(([type, apps]) => ({ flag: "REPEATED_REJECTION", detail: `Rejected at ${type.toLowerCase().replace("_", " ")} round in ${apps.size} drives` })),
        ...(unfilled.length ? [{ flag: "UNFILLED_SECTIONS", detail: `Still to do: ${unfilled.join(", ")}` }] : []),
      ],
    },
  };
}
