import { ApiError, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import type { Session } from "@/lib/auth/session";
import type { JobData } from "@/lib/import/students";

/** Loads an import the caller owns. `editable` also requires that it has not been confirmed yet. */
export async function loadJob(s: Session, jobId: string, editable = true) {
  const job = await db.importJob.findFirst({ where: { id: jobId, collegeId: s.collegeId } });
  if (!job) throw notFound("Import not found");
  if (editable && job.status !== "PREVIEW") throw new ApiError(409, "CONFLICT", "This import has already been confirmed");
  return { job, data: job.rows as unknown as JobData };
}

export const saveJobData = (jobId: string, data: JobData) =>
  db.importJob.update({ where: { id: jobId }, data: { rows: data as unknown as object, totalRows: data.raw.length } });
