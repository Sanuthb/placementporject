import { route } from "@/lib/api/handler";
import { ApiError, notFound } from "@/lib/api/errors";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { validateRows, type RawRow } from "@/lib/import/students";

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
    // Re-validate now: data may have changed since the preview.
    const results = await validateRows(s.collegeId, job.rows as unknown as RawRow[]);
    const ok = results.filter((r) => r.status === "ok");

    let created = 0;
    for (let i = 0; i < ok.length; i += CHUNK) {
      const res = await db.student.createMany({
        data: ok.slice(i, i + CHUNK).map((r) => ({ ...r.student!, collegeId: s.collegeId })),
        skipDuplicates: true,
      });
      created += res.count;
    }
    const failed = results.filter((r) => r.status === "failed").length;
    const skipped = results.length - failed - created;
    const report = results.filter((r) => r.status !== "ok").map(({ row, data, status, reasons }) => ({ row, data, status, reasons }));

    await db.$transaction(async (tx) => {
      await tx.importJob.update({
        where: { id: jobId },
        data: { status: "COMPLETED", createdCount: created, skippedCount: skipped, failedCount: failed, rows: Prisma.DbNull, report, completedAt: new Date() },
      });
      await audit(s, { action: "student.import", entity: "ImportJob", entityId: jobId, after: { created, skipped, failed, fileName: job.fileName } }, tx);
    });
    return { jobId, created, skipped, failed, errorFile: report.length ? `/api/students/import/${jobId}/errors` : null };
  } catch (e) {
    // Let the officer retry the same upload if something unexpected broke.
    await db.importJob.updateMany({ where: { id: jobId, status: "PROCESSING" }, data: { status: "PREVIEW" } });
    throw e;
  }
});
