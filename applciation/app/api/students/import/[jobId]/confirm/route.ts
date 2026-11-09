import { randomUUID } from "node:crypto";
import { route } from "@/lib/api/handler";
import { ApiError, notFound } from "@/lib/api/errors";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { validateRows, type JobData } from "@/lib/import/students";
import { expiryFor, sendInBackground } from "@/lib/invitations/service";
import { hashToken, newToken } from "@/lib/invitations/token";

// Large files are saved in slices so one request never holds a huge statement or transaction.
const CHUNK = 500;

export const POST = route<{ jobId: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (_req, s, { jobId }) => {
  // Claim the job so a double-click cannot import twice.
  const claimed = await db.importJob.updateMany({ where: { id: jobId, collegeId: s.collegeId, status: "PREVIEW" }, data: { status: "PROCESSING" } });
  if (claimed.count === 0) {
    if (!(await db.importJob.findFirst({ where: { id: jobId, collegeId: s.collegeId }, select: { id: true } }))) throw notFound("Import not found");
    throw new ApiError(409, "CONFLICT", "This import has already been confirmed");
  }

  try {
    const job = await db.importJob.findUniqueOrThrow({ where: { id: jobId } });
    const data = job.rows as unknown as JobData;
    // Re-validate now: students or the academic structure may have changed since the preview.
    const results = await validateRows(s.collegeId, data.rows, new Set(data.excluded));
    const ok = results.filter((r) => r.status === "ok");

    let created = 0;
    const expiresAt = await expiryFor(s.collegeId);
    const toEmail: { invitationId: string; token: string }[] = [];
    for (let i = 0; i < ok.length; i += CHUNK) {
      const slice = ok.slice(i, i + CHUNK).map((r) => ({ id: randomUUID(), invitationId: randomUUID(), token: newToken(), s: r.student! }));
      // A slice is all-or-nothing. Each student gets the same "Enrolled" history row as a student added by hand, plus an invitation.
      const made = await db.$transaction(async (tx) => {
        const res = await tx.student.createMany({
          data: slice.map(({ id, s: st }) => ({ id, collegeId: s.collegeId, enrollmentNo: st.enrollmentNo, name: st.name, email: st.email, campusId: st.campusId, admissionYear: st.admissionYear, departmentId: st.departmentId, batchId: st.batchId, programId: st.programId, branchId: st.branchId, currentSemesterId: st.currentSemesterId, currentAcademicYearId: st.currentAcademicYearId })),
          skipDuplicates: true,
        });
        const existing = await tx.student.findMany({ where: { id: { in: slice.map((x) => x.id) } }, select: { id: true } });
        const madeIds = new Set(existing.map((m) => m.id));
        const fresh = slice.filter((x) => madeIds.has(x.id));
        await tx.studentProgression.createMany({
          data: fresh.map(({ id, s: st }) => ({ collegeId: s.collegeId, studentId: id, semesterId: st.currentSemesterId, academicYearId: st.currentAcademicYearId, kind: "ENROLLED" as const, createdById: s.userId })),
        });
        await tx.studentInvitation.createMany({
          data: fresh.map(({ id, invitationId, token, s: st }) => ({
            id: invitationId, collegeId: s.collegeId, studentId: id, invitedEmail: st.email, admissionNumber: st.enrollmentNo, campusId: st.campusId, departmentId: st.departmentId, programId: st.programId, branchId: st.branchId,
            batchId: st.batchId, admissionYear: st.admissionYear, graduationYear: st.graduationYear, tokenHash: hashToken(token), expiresAt, createdById: s.userId,
          })),
        });
        return { count: res.count, fresh };
      });
      created += made.count;
      toEmail.push(...made.fresh.map((x) => ({ invitationId: x.invitationId, token: x.token })));
    }
    // Emails go out after this response, a few at a time. Anything that fails stays "pending" and can be resent from the student list.
    sendInBackground(toEmail, "INVITE");
    const failed = results.filter((r) => r.status === "failed").length;
    const excluded = results.filter((r) => r.status === "excluded").length;
    const skipped = results.length - failed - excluded - created;
    const report = results.filter((r) => r.status !== "ok").map(({ row, data: d, status, reasons }) => ({ row, data: d, status, reasons }));

    await db.$transaction(async (tx) => {
      await tx.importJob.update({
        where: { id: jobId },
        data: { status: "COMPLETED", createdCount: created, skippedCount: skipped, failedCount: failed, rows: Prisma.DbNull, report, completedAt: new Date() },
      });
      await audit(s, { action: "student.import.invite", entity: "ImportJob", entityId: jobId, after: { created, skipped, failed, excluded, fileName: job.fileName } }, tx);
    });
    return { jobId, created, skipped, failed, excluded, errorFile: report.length ? `/api/students/import/${jobId}/errors` : null };
  } catch (e) {
    // Let the officer retry the same upload if something unexpected broke.
    await db.importJob.updateMany({ where: { id: jobId, status: "PROCESSING" }, data: { status: "PREVIEW" } });
    throw e;
  }
});
