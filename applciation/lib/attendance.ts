import { randomInt, timingSafeEqual } from "node:crypto";
import { ApiError, badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { getDrive } from "@/lib/drives";
import type { AttendanceStatus, CheckInMethod, Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;
type Round = { id: string; order: number };

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I so codes are easy to type
export const newCode = () => Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
export const roundKey = (roundId?: string | null) => roundId ?? "drive";

/** Loads the drive and (optional) round an attendance action refers to. Drafts and cancelled drives have no attendance. */
export async function loadScope(collegeId: string, driveId: string, roundId?: string | null) {
  const drive = await getDrive(collegeId, driveId);
  if (drive.status === "DRAFT" || drive.status === "CANCELLED") throw new ApiError(409, "CONFLICT", "Attendance is only available for published or closed drives");
  let round: Round | null = null;
  if (roundId) {
    round = await db.driveRound.findFirst({ where: { id: roundId, driveId }, select: { id: true, order: true } });
    if (!round) throw notFound("Round not found");
  }
  return { drive, round };
}

/** Who is expected: applicants waiting for this round (or already given a result in it); for drive-level, all live applicants. */
function expectedWhere(driveId: string, round: Round | null): Prisma.ApplicationWhereInput {
  return round
    ? { driveId, OR: [{ status: "SHORTLISTED", currentRound: round.order }, { results: { some: { roundId: round.id } } }] }
    : { driveId, status: { in: ["APPLIED", "SHORTLISTED", "ON_HOLD"] } };
}
export const expectedApplications = (tx: Tx | typeof db, driveId: string, round: Round | null) =>
  tx.application.findMany({ where: expectedWhere(driveId, round), select: { id: true, studentId: true, student: { select: { id: true, name: true, enrollmentNo: true, departmentId: true } } } });

export async function ensureSession(tx: Tx, collegeId: string, driveId: string, round: Round | null) {
  const key = roundKey(round?.id);
  return tx.attendanceSession.upsert({ where: { driveId_roundKey: { driveId, roundKey: key } }, update: {}, create: { collegeId, driveId, roundId: round?.id ?? null, roundKey: key, code: newCode() } });
}

/** Attended/absent also lands on the student's round result, but never overwrites a cleared or rejected decision. */
async function syncRoundResult(tx: Tx, applicationId: string, roundId: string, status: AttendanceStatus, actorId: string | null) {
  const existing = await tx.roundResult.findUnique({ where: { applicationId_roundId: { applicationId, roundId } } });
  if (existing && existing.status !== "ATTENDED" && existing.status !== "ABSENT") return;
  const result = status === "PRESENT" ? "ATTENDED" : "ABSENT";
  if (existing?.status === result) return;
  await tx.roundResult.upsert({
    where: { applicationId_roundId: { applicationId, roundId } },
    update: { status: result, recordedById: actorId },
    create: { applicationId, roundId, status: result, recordedById: actorId },
  });
  await tx.applicationEvent.create({ data: { applicationId, roundId, roundResult: result, actorId, note: "Attendance" } });
}

export async function markAttendance(tx: Tx, p: { collegeId: string; driveId: string; round: Round | null; studentId: string; status: AttendanceStatus; method: CheckInMethod; actorId: string | null }) {
  const app = await tx.application.findFirst({ where: { ...expectedWhere(p.driveId, p.round), studentId: p.studentId }, select: { id: true } });
  if (!app) throw badRequest("This student is not expected at this " + (p.round ? "round" : "drive"));
  const key = roundKey(p.round?.id);
  const rec = await tx.attendanceRecord.upsert({
    where: { driveId_roundKey_studentId: { driveId: p.driveId, roundKey: key, studentId: p.studentId } },
    update: { status: p.status, method: p.method, markedById: p.actorId, markedAt: new Date(), ...(p.status === "PRESENT" ? { excused: false, excuseReason: null } : {}) },
    create: { collegeId: p.collegeId, driveId: p.driveId, roundId: p.round?.id ?? null, roundKey: key, studentId: p.studentId, status: p.status, method: p.method, markedById: p.actorId },
  });
  if (p.round) await syncRoundResult(tx, app.id, p.round.id, p.status, p.actorId);
  return rec;
}

/** Live counts, plus the per-student list when `detail` is set. */
export async function attendanceSummary(collegeId: string, driveId: string, round: Round | null, detail: boolean) {
  const [expected, records, session] = await Promise.all([
    expectedApplications(db, driveId, round),
    db.attendanceRecord.findMany({ where: { driveId, roundKey: roundKey(round?.id) }, select: { studentId: true, status: true, method: true, excused: true, markedAt: true } }),
    db.attendanceSession.findUnique({ where: { driveId_roundKey: { driveId, roundKey: roundKey(round?.id) } }, select: { isOpen: true, closedAt: true } }),
  ]);
  const byStudent = new Map(records.map((r) => [r.studentId, r]));
  let present = 0, absent = 0;
  for (const e of expected) { const r = byStudent.get(e.studentId); if (r?.status === "PRESENT") present++; else if (r?.status === "ABSENT") absent++; }
  const counts = { expected: expected.length, present, absent, notMarked: expected.length - present - absent };
  const base = { collegeId, driveId, roundId: round?.id ?? null, session: session ?? null, counts };
  if (!detail) return base;
  return { ...base, students: expected.map((e) => ({ ...e.student, attendance: byStudent.get(e.studentId) ?? null })).sort((a, b) => a.name.localeCompare(b.name)) };
}

/** Checks a student in with the session code. Used by staff on a student's behalf and by the student's own app. */
export async function checkInWithCode(p: { collegeId: string; driveId: string; roundId?: string | null; code: string; studentId: string; actorId: string | null }) {
  const { round } = await loadScope(p.collegeId, p.driveId, p.roundId);
  const session = await db.attendanceSession.findUnique({ where: { driveId_roundKey: { driveId: p.driveId, roundKey: roundKey(round?.id) } } });
  if (!session) throw new ApiError(404, "NO_SESSION", "Attendance has not been opened for this drive/round");
  if (!session.isOpen) throw new ApiError(409, "SESSION_CLOSED", "Attendance is closed");
  const a = Buffer.from(session.code), c = Buffer.from(p.code.trim().toUpperCase());
  if (a.length !== c.length || !timingSafeEqual(a, c)) throw new ApiError(400, "BAD_CODE", "That code is not valid");
  return db.$transaction((tx) => markAttendance(tx, { collegeId: p.collegeId, driveId: p.driveId, round, studentId: p.studentId, status: "PRESENT", method: "CODE", actorId: p.actorId }));
}
