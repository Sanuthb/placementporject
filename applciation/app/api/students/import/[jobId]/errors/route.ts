import { route } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { errorFileBuffer, type RowResult } from "@/lib/import/students";

export const GET = route<{ jobId: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (_req, s, { jobId }) => {
  const job = await db.importJob.findFirst({ where: { id: jobId, collegeId: s.collegeId, status: "COMPLETED" }, select: { report: true } });
  if (!job) throw notFound("Completed import not found");
  const buf = await errorFileBuffer((job.report ?? []) as unknown as RowResult[]);
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="import-errors-${jobId.slice(0, 8)}.xlsx"`,
    },
  });
});
