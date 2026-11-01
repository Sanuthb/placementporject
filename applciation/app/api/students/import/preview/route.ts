import { readForm } from "@/lib/api/parse";
import { route } from "@/lib/api/handler";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { MAX_FILE_BYTES, readRows, validateRows } from "@/lib/import/students";

export const POST = route({ limit: { name: "import", max: 30, windowSec: 3600 }, roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (req, s) => {
  const file = (await readForm(req, MAX_FILE_BYTES)).get("file");
  if (!(file instanceof File)) throw badRequest('Send the spreadsheet as multipart field "file"');
  if (file.size > MAX_FILE_BYTES) throw badRequest("File is larger than 5 MB");

  const raw = await readRows(Buffer.from(await file.arrayBuffer()), file.name);
  const results = await validateRows(s.collegeId, raw);
  const count = (st: string) => results.filter((r) => r.status === st).length;

  const job = await db.importJob.create({
    data: { collegeId: s.collegeId, createdById: s.userId, fileName: file.name.slice(0, 200), totalRows: raw.length, rows: raw },
  });
  return {
    jobId: job.id,
    totalRows: raw.length,
    willCreate: count("ok"),
    willSkip: count("skipped"),
    invalid: count("failed"),
    preview: results.slice(0, 20).map(({ row, data, status, reasons }) => ({ row, data, status, reasons })),
  };
});
