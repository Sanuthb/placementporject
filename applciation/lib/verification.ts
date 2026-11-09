import { z } from "zod";
import { Prisma, ProfileSection } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { ApiError, badRequest, notFound } from "@/lib/api/errors";
import { departmentScope, type Session, isCoordinatorOnly } from "@/lib/auth/session";
import { notifyStaff } from "@/lib/notify";
import { syncOnboardingStatus } from "@/lib/invitations/status";

type Tx = Prisma.TransactionClient;

const loose = z.record(z.string(), z.unknown());
const pct = z.number().min(0).max(100);

/**
 * Section content validation. Academics is strict because eligibility rules (Phase 3) read these fields.
 * The other sections are validated loosely until the student-facing spec fixes their shape.
 */
export const sectionSchemas: Record<ProfileSection, z.ZodType<Record<string, unknown>>> = {
  PERSONAL: loose,
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
};

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
  const required = settings?.requiredSections?.length ? settings.requiredSections : Object.values(ProfileSection);
  const verified = new Set(sections.filter((s) => s.status === "VERIFIED").map((s) => s.section));
  const stage = required.every((r) => verified.has(r)) ? "VERIFIED" : "PROFILE_PENDING";
  if (stage !== student.stage) await tx.student.update({ where: { id: studentId }, data: { stage } });
  await syncOnboardingStatus(tx, studentId);
}

/** Saves section content, and optionally submits it for review. Used by staff on behalf of a student today, and by the student-facing API later. */
export async function saveSection(tx: Tx, ctx: { collegeId: string; actorId: string | null }, studentId: string, section: ProfileSection, raw: unknown, submit: boolean, quiet = false) {
  const data = sectionSchemas[section].parse(raw) as Prisma.InputJsonObject;
  if (JSON.stringify(data).length > MAX_JSON_BYTES) throw badRequest("Section content is too large");

  const row = await tx.studentSection.upsert({
    where: { studentId_section: { studentId, section } },
    update: {},
    create: { collegeId: ctx.collegeId, studentId, section },
  });
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
  await recomputeStage(tx, session.collegeId, row.studentId);
  return { sectionId, studentId: row.studentId, section: row.section };
}
