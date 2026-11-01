import { route } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";

export const GET = route<{ jobId: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (_req, s, { jobId }) => {
  const job = await db.importJob.findFirst({
    where: { id: jobId, collegeId: s.collegeId },
    select: { id: true, fileName: true, status: true, totalRows: true, createdCount: true, skippedCount: true, failedCount: true, createdAt: true, completedAt: true },
  });
  if (!job) throw notFound("Import not found");
  return job;
});
