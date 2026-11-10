import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import type { ModuleKey, Prisma, Role } from "@/generated/prisma/client";
import { ApiError, badRequest, notFound } from "@/lib/api/errors";
import { departmentScope, hasRole, type Session } from "@/lib/auth/session";
import type { StudentSession } from "@/lib/auth/student";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { DocumentRejected, inspectUpload } from "@/lib/documents";
import { sniffResource } from "@/lib/resources";
import { notifyStudent } from "@/lib/notify";
import { attendanceSummary, checkEligibility, completionChecks, type Facts, type Rules } from "@/lib/internships";

export const INT_BUCKET = "student-documents";
export const INT_ADMIN: { roles: Role[]; module: ModuleKey } = { roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "INTERNSHIPS" };
export const isStaff = (s: Session) => hasRole(s, "TPO_ADMIN", "PLACEMENT_OFFICER");

/** Placement staff see every internship; a department coordinator their department's; a faculty member the ones they mentor. */
export function scope(s: Session): Prisma.InternshipWhereInput {
  if (isStaff(s)) return { collegeId: s.collegeId };
  if (hasRole(s, "DEPARTMENT_COORDINATOR")) return { collegeId: s.collegeId, student: { ...departmentScope(s) } };
  return { collegeId: s.collegeId, facultyMentorId: s.userId };
}
export async function internshipOf(s: Session, id: string) {
  const i = await db.internship.findFirst({ where: { id, ...scope(s) } });
  if (!i) throw notFound("Internship not found");
  return i;
}

export const signed = async (path: string) => (await supabaseAdmin().storage.from(INT_BUCKET).createSignedUrl(path, 3600)).data?.signedUrl ?? null;
export const removeFile = async (path: string | null | undefined) => { if (path) await supabaseAdmin().storage.from(INT_BUCKET).remove([path]).catch(() => undefined); };

/** Stores a proof file (offer letter or certificate): PDF, PNG or JPEG up to 10 MB, type read from the bytes. */
export async function storeProof(collegeId: string, internshipId: string, kind: string, file: File) {
  const bytes = Buffer.from(await file.arrayBuffer());
  let info;
  try { info = inspectUpload(bytes, file.type, file.name); } catch (e) { if (e instanceof DocumentRejected) throw badRequest(e.message); throw e; }
  const path = `${collegeId}/internships/${internshipId}/${kind}/${randomUUID()}-${info.safeName}`;
  const up = await supabaseAdmin().storage.from(INT_BUCKET).upload(path, Buffer.from(bytes), { contentType: info.mime });
  if (up.error) throw badRequest("Upload failed: " + up.error.message);
  return { path, name: file.name.slice(0, 200), mime: info.mime };
}
/** Stores a deliverable: PDF, Word or PowerPoint up to 20 MB. */
export async function storeDeliverable(collegeId: string, internshipId: string, file: File) {
  const bytes = Buffer.from(await file.arrayBuffer());
  let info;
  try { info = sniffResource(bytes, file.name, file.type); } catch (e) { if (e instanceof DocumentRejected) throw badRequest(e.message); throw e; }
  if (info.kind !== "DOCUMENT") throw badRequest("Upload a PDF, Word or PowerPoint file");
  const path = `${collegeId}/internships/${internshipId}/work/${randomUUID()}-${info.safeName}`;
  const up = await supabaseAdmin().storage.from(INT_BUCKET).upload(path, bytes, { contentType: info.mime });
  if (up.error) throw badRequest("Upload failed: " + up.error.message);
  return { path, name: file.name.slice(0, 200), mime: info.mime };
}

// ---- eligibility ----
const num = (d: { toString(): string } | null) => (d === null ? null : Number(d.toString()));
export const rulesOf = (p: { minCgpa: Prisma.Decimal | null; minTenthPct: Prisma.Decimal | null; minTwelfthPct: Prisma.Decimal | null; maxActiveBacklogs: number | null; departmentIds: string[]; batchIds: string[]; programIds: string[]; allowPlaced: boolean }): Rules =>
  ({ minCgpa: num(p.minCgpa), minTenthPct: num(p.minTenthPct), minTwelfthPct: num(p.minTwelfthPct), maxActiveBacklogs: p.maxActiveBacklogs, departmentIds: p.departmentIds, batchIds: p.batchIds, programIds: p.programIds, allowPlaced: p.allowPlaced });

export async function factsOf(studentId: string): Promise<Facts> {
  const [st, running] = await Promise.all([
    db.student.findUniqueOrThrow({ where: { id: studentId }, select: { departmentId: true, batchId: true, programId: true, isPlaced: true, stage: true, isActive: true, isArchived: true, sections: { where: { section: "ACADEMICS", status: "VERIFIED" }, select: { data: true } } } }),
    db.internship.count({ where: { studentId, status: { in: ["ALLOTTED", "ONGOING"] } } }),
  ]);
  return { departmentId: st.departmentId, batchId: st.batchId, programId: st.programId, isPlaced: st.isPlaced, hasRunningInternship: running > 0, onboarded: st.stage === "ONBOARDED" && st.isActive && !st.isArchived, academics: (st.sections[0]?.data as Facts["academics"]) ?? null };
}
export const gapsFor = async (p: Parameters<typeof rulesOf>[0], studentId: string) => checkEligibility(rulesOf(p), await factsOf(studentId));

// ---- creating the internship ----
/** Turns an approved application into a running record: the internship, its schedule, a final-report task, the faculty mentor (the student's own mentor by default). */
export async function allotFromApplication(appId: string, by: { userId: string; collegeId: string }, o: { facultyMentorId?: string | null; from: string; decision: Prisma.InternshipApplicationUpdateManyMutationInput }) {
  const a = await db.internshipApplication.findUniqueOrThrow({ where: { id: appId }, include: { posting: true, student: { select: { mentorId: true } } } });
  const src = a.posting
    ? { companyId: a.posting.companyId, companyName: a.posting.companyName, role: a.posting.title, startDate: a.posting.startDate, endDate: a.posting.endDate, stipendInr: a.posting.stipendInr, mentorName: null as string | null, mentorEmail: null as string | null }
    : { companyId: null, companyName: a.companyName!, role: a.role!, startDate: a.startDate!, endDate: a.endDate!, stipendInr: null, mentorName: a.mentorName, mentorEmail: a.mentorEmail };
  if (await db.internship.findFirst({ where: { studentId: a.studentId, status: { in: ["ALLOTTED", "ONGOING"] } } })) throw new ApiError(409, "CONFLICT", "This student already has an internship in progress");
  const facultyMentorId = o.facultyMentorId === undefined ? a.student.mentorId : o.facultyMentorId;
  return db.$transaction(async (tx) => {
    const i = await tx.internship.create({ data: { collegeId: a.collegeId, studentId: a.studentId, ...src, postingId: a.postingId, applicationId: a.id, facultyMentorId, createdById: by.userId } });
    await tx.internshipTask.create({ data: { internshipId: i.id, title: "Final internship report", description: "Write up what you did, what you learned and what you delivered. Attach it as a PDF or Word file or paste it here.", dueAt: src.endDate, isFinalReport: true, assignedByName: "Placement office" } });
    const claimed = await tx.internshipApplication.updateMany({ where: { id: a.id, status: o.from as never }, data: { ...o.decision, status: "ALLOTTED" } });
    if (claimed.count === 0) throw new ApiError(409, "CONFLICT", "This application was just changed by someone else. Reload and try again");
    await notifyStudent(a.collegeId, a.studentId, { type: "internship.allotted", title: `Internship confirmed: ${src.role} at ${src.companyName}`, link: "/student/internships" }, tx);
    return i;
  });
}

// ---- tokens ----
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export const feedbackLink = (token: string) => `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/internship-feedback/${token}`;

// ---- the full picture of one internship ----
const dateStr = (d: Date) => d.toISOString().slice(0, 10);

/** Attendance, tasks, logs, evaluations and the completion checks for one internship. */
export async function internshipDetail(id: string, audience: "staff" | "student") {
  const i = await db.internship.findUniqueOrThrow({
    where: { id },
    include: {
      student: { select: { id: true, name: true, enrollmentNo: true } }, logs: { orderBy: { weekStart: "asc" } }, evaluations: { orderBy: { createdAt: "desc" } },
      attendance: true, tasks: { orderBy: [{ isFinalReport: "asc" }, { createdAt: "asc" }] }, feedback: { orderBy: { createdAt: "desc" } },
      links: audience === "staff" ? { select: { id: true, name: true, email: true, expiresAt: true, usedAt: true }, orderBy: { createdAt: "desc" } } : false,
    },
  });
  const today = new Date();
  const att = attendanceSummary({ start: i.startDate, end: i.endDate, workDays: i.workDays, today, marks: i.attendance.map((a) => ({ date: dateStr(a.date), status: a.status, verified: a.verified })) });
  const checks = completionChecks({ status: i.status, endDate: i.endDate, today, evaluations: i.evaluations.length, logsPending: i.logs.filter((l) => l.status === "SUBMITTED").length, tasksOpen: i.tasks.filter((t) => t.status !== "APPROVED").length, attendancePercent: att.percent, certificate: i.certificateStatus });
  const mentor = i.facultyMentorId ? await db.user.findUnique({ where: { id: i.facultyMentorId }, select: { name: true } }) : null;
  const { certificatePath, ...rest } = i;
  const scores = i.evaluations.map((e) => e.score);
  return {
    ...rest, facultyMentorName: mentor?.name ?? null, certificateUrl: certificatePath ? await signed(certificatePath) : null, attendanceSummary: att, completionChecks: checks,
    attendance: i.attendance.map((a) => ({ id: a.id, date: dateStr(a.date), status: a.status, note: a.note, markedBy: a.markedBy, verified: a.verified })).sort((a, b) => b.date.localeCompare(a.date)),
    tasks: await Promise.all(i.tasks.map(async ({ filePath, ...t }) => ({ ...t, fileUrl: filePath ? await signed(filePath) : null }))),
    summary: { approvedHours: i.logs.filter((l) => l.status === "APPROVED").reduce((a, l) => a + l.hours, 0), logsAwaitingReview: i.logs.filter((l) => l.status === "SUBMITTED").length, averageScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null },
  };
}

export async function myInternship(me: StudentSession, id: string) {
  const i = await db.internship.findFirst({ where: { id, studentId: me.studentId } });
  if (!i) throw notFound("Internship not found");
  return i;
}

/** A student's finished internships from the college's records, for the resume and the shareable profile. Only completed ones, and whether the certificate was verified. */
export async function internshipRecords(studentId: string) {
  const rows = await db.internship.findMany({ where: { studentId, status: "COMPLETED" }, orderBy: { endDate: "desc" }, take: 8, select: { id: true, companyName: true, role: true, startDate: true, endDate: true, certificateStatus: true, ppoStatus: true } });
  return rows.map((r) => ({ id: r.id, company: r.companyName, role: r.role, from: r.startDate.toISOString().slice(0, 10), to: r.endDate.toISOString().slice(0, 10), certificateVerified: r.certificateStatus === "VERIFIED", preplacementOffer: r.ppoStatus === "ACCEPTED" }));
}
