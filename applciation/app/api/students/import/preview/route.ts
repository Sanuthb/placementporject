import { readForm } from "@/lib/api/parse";
import { route } from "@/lib/api/handler";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { FIELDS, MAX_FILE_BYTES, applyMapping, readFile, suggestMapping, type JobData } from "@/lib/import/students";

/** Step 1: read the file and suggest how its columns map to student fields. Nothing is validated or saved as students yet. */
export const POST = route({ limit: { name: "import", max: 30, windowSec: 3600 }, roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (req, s) => {
  const file = (await readForm(req, MAX_FILE_BYTES)).get("file");
  if (!(file instanceof File)) throw badRequest('Send the spreadsheet as multipart field "file"');
  if (file.size > MAX_FILE_BYTES) throw badRequest("File is larger than 5 MB");

  const { headers, raw } = await readFile(Buffer.from(await file.arrayBuffer()), file.name);
  const mapping = suggestMapping(headers);
  const data: JobData = { headers, raw, mapping, rows: applyMapping(raw, mapping), excluded: [] };
  const job = await db.importJob.create({
    data: { collegeId: s.collegeId, createdById: s.userId, fileName: file.name.slice(0, 200), totalRows: raw.length, rows: data as unknown as object },
  });
  return {
    jobId: job.id, fileName: job.fileName, totalRows: raw.length, headers, mapping,
    sample: raw.slice(0, 3).map((r) => r.data),
    fields: FIELDS.map(({ key, label, required }) => ({ key, label, required })),
  };
});
