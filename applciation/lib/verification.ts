import { z } from "zod";
import { Prisma, ProfileSection } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { ApiError, badRequest, notFound } from "@/lib/api/errors";
import { departmentScope, type Session, isCoordinatorOnly } from "@/lib/auth/session";
import { notifyStaff } from "@/lib/notify";
import { syncOnboardingStatus } from "@/lib/invitations/status";
import { audit } from "@/lib/audit";
import { personalSection, studentFieldsFromPersonal } from "@/lib/personal";
import { achievementsSection } from "@/lib/achievements";
import { overlayForSection, refreshVerifiedSnapshot, submitRecords, verifyRecords } from "@/lib/academicRecords";

type Tx = Prisma.TransactionClient;

const loose = z.record(z.string(), z.unknown());
const pct = z.number().min(0).max(100);

/**
 * Section content validation. Academics is strict because eligibility rules (Phase 3) read these fields.
 * The other sections are validated loosely until the student-facing spec fixes their shape.
 */
export const sectionSchemas: Record<ProfileSection, z.ZodType<Record<string, unknown>>> = {
  PERSONAL: personalSection,
  ACADEMICS: z.looseObject({
    cgpa: z.number().min(0).max(10),
    tenthPercentage: pct,
    twelfthPercentage: pct,
    activeBacklogs: z.number().int().min(0),
    semesters: z.array(z.record(z.string(), z.unknown())).optional(),
    backlogHistory: z.array(z.record(z.string(), z.unknown())).optional(),
  }),
  EDUCATION_HISTORY: loose,
  SKILLS: loose,
  PROJECTS: loose,
  INTERNSHIPS: loose,
  RESUME: loose,
  DOCUMENTS: loose,
  ACHIEVEMENTS: achievementsSection,
};

/** Sections a student may skip unless the college makes them required in settings. */
export const OPTIONAL_SECTIONS: ProfileSection[] = ["ACHIEVEMENTS"];
/** What "required" means when a college has not chosen. Never includes optional sections, so adding one cannot demote verified students. */
export const DEFAULT_REQUIRED_SECTIONS: ProfileSection[] = Object.values(ProfileSection).filter((s) => !OPTIONAL_SECTIONS.includes(s));

const MAX_JSON_BYTES = 100_000;

export function parseSection(value: string): ProfileSection {
  const r = z.enum(ProfileSection).safeParse(value);
  if (!r.success) throw badRequest(`Unknown section "${value}"`);
  return r.data;
}

/** Loads a student the caller may act on (coordinators: own department only). */
export async function scopedStudent(session: Session, studentId: string) {
  const st = await db.student.findFirst({ where: { id: studentId, collegeId: session.collegeId, ...departmentScope(session) } });
  if (!st) throw notFound("Student not found");
  return st;
}

/** Moves a student between PROFILE_PENDING and VERIFIED based on required sections. ONBOARDED is never touched here. */
export async function recomputeStage(tx: Tx, collegeId: string, studentId: string) {
  const [settings, sections, student] = await Promise.all([
    tx.collegeSettings.findUnique({ where: { collegeId } }),
    tx.studentSection.findMany({ where: { studentId }, select: { section: true, status: true } }),
    tx.student.findUniqueOrThrow({ where: { id: studentId }, select: { stage: true } }),
  ]);
  if (student.stage === "ONBOARDED") return;
  const required = settings?.requiredSections?.length ? settings.requiredSections : DEFAULT_REQUIRED_SECTIONS;
  const verified = new Set(sections.filter((s) => s.status === "VERIFIED").map((s) => s.section));
  const stage = required.every((r) => verified.has(r)) ? "VERIFIED" : "PROFILE_PENDING";
  if (stage !== student.stage) await tx.student.update({ where: { id: studentId }, data: { stage } });
  await syncOnboardingStatus(tx, studentId);
}

/** Saves section content, and optionally submits it for review. Used by staff on behalf of a student today, and by the student-facing API later. */
export async function saveSection(tx: Tx, ctx: { collegeId: string; actorId: string | null }, studentId: string, section: ProfileSection, raw: unknown, submit: boolean, quiet = false) {
  const row = await tx.studentSection.upsert({
    where: { studentId_section: { studentId, section } },
    update: {},
    create: { collegeId: ctx.collegeId, studentId, section },
  });
  // Academic sections carry what the student's structured records say, so the section and the records cannot disagree.
  const merged = section === "ACADEMICS" || section === "EDUCATION_HISTORY" ? await overlayForSection(tx, studentId, section, (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>, row.pendingData ?? row.data) : raw;
  const data = sectionSchemas[section].parse(merged) as Prisma.InputJsonObject;
  if (JSON.stringify(data).length > MAX_JSON_BYTES) throw badRequest("Section content is too large");
  if (row.status === "SUBMITTED") throw new ApiError(409, "CONFLICT", "This section is under review and cannot be edited");

  // Verified values are never overwritten in place: edits wait in pendingData until re-approved.
  const toPending = row.status === "VERIFIED" || row.pendingData !== null;
  const updated = await tx.studentSection.update({
    where: { id: row.id },
    data: {
      ...(toPending ? { pendingData: data } : { data }),
      ...(submit ? { status: "SUBMITTED", submittedAt: new Date(), reviewComment: null } : {}),
    },
  });
  if (submit) {
    await submitRecords(tx, studentId, section);
    await tx.verificationEvent.create({ data: { collegeId: ctx.collegeId, studentId, section, action: "SUBMITTED", actorId: ctx.actorId, snapshot: data } });
    await recomputeStage(tx, ctx.collegeId, studentId);
    const st = await tx.student.findUniqueOrThrow({ where: { id: studentId }, select: { name: true, departmentId: true } });
    if (!quiet) await notifyStaff(ctx.collegeId, { type: "section.submitted", title: `${st.name} submitted ${section.toLowerCase().replace("_", " ")} for review`, link: `/verification?student=${studentId}`, departmentId: st.departmentId, excludeUserId: ctx.actorId }, tx);
  }
  return updated;
}

/** Approves a submitted section. Fails with 409 if it is no longer awaiting review. */
export async function approveSection(tx: Tx, session: Session, sectionId: string, comment?: string) {
  const row = await tx.studentSection.findFirst({ where: { id: sectionId, collegeId: session.collegeId }, include: { student: { select: { departmentId: true } } } });
  if (!row) throw notFound("Section not found");
  if (isCoordinatorOnly(session) && row.student.departmentId !== session.departmentId) throw notFound("Section not found");

  const accepted = (row.pendingData ?? row.data) as Prisma.InputJsonObject;
  const claim = await tx.studentSection.updateMany({
    where: { id: sectionId, status: "SUBMITTED" },
    data: { status: "VERIFIED", data: accepted, pendingData: Prisma.DbNull, reviewedAt: new Date(), reviewComment: comment ?? null },
  });
  if (claim.count === 0) throw new ApiError(409, "CONFLICT", "This section is not awaiting review");
  await tx.verificationEvent.create({ data: { collegeId: session.collegeId, studentId: row.studentId, section: row.section, action: "APPROVED", actorId: session.userId, comment, snapshot: accepted } });
  if (row.section === "PERSONAL") await syncPersonalToStudent(tx, session, row.studentId, accepted as Record<string, unknown>);
  // Submitted records become verified, pending edits are applied, and the section data is regenerated from them (same keys as before).
  if (await verifyRecords(tx, session.userId, row.studentId, row.section)) {
    await refreshVerifiedSnapshot(tx, row.studentId, row.section);
    // The 10th / 12th percentages in ACADEMICS come from the qualification records, so approving those refreshes it too.
    if (row.section === "EDUCATION_HISTORY") await refreshVerifiedSnapshot(tx, row.studentId, "ACADEMICS");
  }
  await recomputeStage(tx, session.collegeId, row.studentId);
  return { sectionId, studentId: row.studentId, section: row.section };
}

/**
 * Approved personal details become the student's record, in the same transaction as the approval, so the record and the verified section
 * cannot disagree. The previous and new values are written to the audit log, which is the change history for these fields.
 */
async function syncPersonalToStudent(tx: Tx, session: Session, studentId: string, accepted: Record<string, unknown>) {
  const next = studentFieldsFromPersonal(accepted);
  if (Object.keys(next).length === 0) return;
  const before = await tx.student.findUniqueOrThrow({ where: { id: studentId }, select: { phone: true, dateOfBirth: true, gender: true, address: true } });
  const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
  const changes: Record<string, { from: string | null; to: string | null }> = {};
  if (next.phone !== undefined && next.phone !== before.phone) changes.phone = { from: before.phone, to: next.phone };
  if (next.gender !== undefined && next.gender !== before.gender) changes.gender = { from: before.gender, to: next.gender };
  if (next.address !== undefined && next.address !== before.address) changes.address = { from: before.address, to: next.address };
  if (next.dateOfBirth !== undefined && iso(next.dateOfBirth) !== iso(before.dateOfBirth)) changes.dateOfBirth = { from: iso(before.dateOfBirth), to: iso(next.dateOfBirth) };
  if (Object.keys(changes).length === 0) return;
  await tx.student.update({ where: { id: studentId }, data: next });
  await audit(session, { action: "student.personal.sync", entity: "Student", entityId: studentId, before: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.from])), after: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.to])), reason: "Personal details approved" }, tx);
}
