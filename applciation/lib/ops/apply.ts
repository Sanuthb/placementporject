import { ApiError, badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { evaluateEligibility } from "@/lib/eligibility";
import { getDrive } from "@/lib/drives";
import { resumeSections } from "@/lib/studentResume";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { randomUUID } from "node:crypto";

type Actor = { collegeId: string; userId: string | null };

/** Applies a student to a drive, enforcing the same deadline and eligibility rules whoever clicks. A withdrawn application can be revived. */
export async function applyToDrive(actor: Actor, driveId: string, studentId: string, note = "Applied", opts: { resumeDocumentId?: string } = {}) {
  const drive = await getDrive(actor.collegeId, driveId);
  if (drive.status !== "PUBLISHED") throw new ApiError(409, "CONFLICT", "Applications are only open for published drives");
  if (drive.applicationDeadline <= new Date()) throw new ApiError(409, "DEADLINE_PASSED", "The application deadline has passed");
  const [row] = await evaluateEligibility(drive, { studentId });
  if (!row?.eligible) throw badRequest("Student is not eligible for this drive", { reasons: row?.reasons ?? ["Student must be active, onboarded and registered for placement"] });

  // Freeze the resume now, so later edits to the profile never change what the company was sent.
  const { verified } = await resumeSections(studentId);
  let file: { path: string; name: string } | null = null;
  if (opts.resumeDocumentId) {
    const doc = await db.sectionDocument.findFirst({ where: { id: opts.resumeDocumentId, collegeId: actor.collegeId, section: { studentId, section: "RESUME" } }, select: { storagePath: true, fileName: true } });
    if (!doc) throw badRequest("That resume file was not found in your Resume section");
    const to = `${actor.collegeId}/${studentId}/applications/${driveId}/${randomUUID()}-${doc.fileName.replace(/[^A-Za-z0-9._-]/g, "_").slice(-100)}`;
    const cp = await supabaseAdmin().storage.from("student-documents").copy(doc.storagePath, to);
    if (cp.error) throw badRequest("Could not attach that resume: " + cp.error.message);
    file = { path: to, name: doc.fileName };
  }
  const resume = { resumeSnapshot: verified as object, resumeFilePath: file?.path ?? null, resumeFileName: file?.name ?? null };

  return db.$transaction(async (tx) => {
    const existing = await tx.application.findUnique({ where: { driveId_studentId: { driveId, studentId } } });
    if (existing && existing.status !== "WITHDRAWN") throw new ApiError(409, "CONFLICT", "Student has already applied");
    const app = existing
      ? await tx.application.update({ where: { id: existing.id }, data: { status: "APPLIED", currentRound: null, clearedAllRounds: false, ...resume } })
      : await tx.application.create({ data: { collegeId: actor.collegeId, driveId, studentId, ...resume } });
    await tx.applicationEvent.create({ data: { applicationId: app.id, status: "APPLIED", actorId: actor.userId, note } });
    await audit(actor, { action: "application.create", entity: "Application", entityId: app.id, after: { driveId, studentId } }, tx);
    return { id: app.id, status: app.status };
  });
}

/** Withdraws an application before the deadline, unless an offer already exists. */
export async function withdrawApplication(actor: Actor, driveId: string, studentId: string) {
  const drive = await getDrive(actor.collegeId, driveId);
  if (drive.status !== "PUBLISHED" || drive.applicationDeadline <= new Date()) throw new ApiError(409, "CONFLICT", "Applications can only be withdrawn before the deadline");
  return db.$transaction(async (tx) => {
    const app = await tx.application.findUnique({ where: { driveId_studentId: { driveId, studentId } }, include: { offers: { where: { status: { in: ["OFFERED", "ACCEPTED"] } }, select: { id: true } } } });
    if (!app || app.status === "WITHDRAWN") throw new ApiError(404, "NOT_FOUND", "No active application to withdraw");
    if (app.offers.length) throw new ApiError(409, "CONFLICT", "An offer exists for this application");
    await tx.application.update({ where: { id: app.id }, data: { status: "WITHDRAWN" } });
    await tx.applicationEvent.create({ data: { applicationId: app.id, status: "WITHDRAWN", actorId: actor.userId, note: "Withdrawn" } });
    await audit(actor, { action: "application.withdraw", entity: "Application", entityId: app.id }, tx);
    return { id: app.id, status: "WITHDRAWN" };
  });
}
