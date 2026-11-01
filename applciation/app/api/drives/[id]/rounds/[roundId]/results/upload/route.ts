import { readForm } from "@/lib/api/parse";
import { route } from "@/lib/api/handler";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { getDrive } from "@/lib/drives";
import { gate } from "@/lib/approvals";
import { readSheet } from "@/lib/import/sheet";
import { recordRoundResults, type ResultInput } from "@/lib/ops/roundResults";
import type { RoundResultStatus } from "@/generated/prisma/client";

const COLUMNS = ["enrollment_no", "result", "score", "remarks"] as const;
const MAP: Record<string, RoundResultStatus> = { attended: "ATTENDED", absent: "ABSENT", cleared: "CLEARED", selected: "CLEARED", pass: "CLEARED", passed: "CLEARED", rejected: "REJECTED", fail: "REJECTED", failed: "REJECTED" };

/** Bulk results from a spreadsheet: enrollment_no, result (attended/absent/cleared/rejected), score, remarks. */
export const POST = route<{ id: string; roundId: string }>({ limit: { name: "upload", max: 60, windowSec: 3600 }, roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (req, s, { id, roundId }) => {
  const drive = await getDrive(s.collegeId, id);
  const file = (await readForm(req, 5 * 1024 * 1024)).get("file");
  if (!(file instanceof File)) throw badRequest('Send the spreadsheet as multipart field "file"');
  if (file.size > 5 * 1024 * 1024) throw badRequest("File is larger than 5 MB");
  const rows = await readSheet(Buffer.from(await file.arrayBuffer()), file.name, COLUMNS, ["enrollment_no", "result"], 2000);

  const apps = await db.application.findMany({ where: { driveId: id, collegeId: s.collegeId, student: { enrollmentNo: { in: rows.map((r) => r.data.enrollment_no) } } }, select: { id: true, student: { select: { enrollmentNo: true } } } });
  const byEnrollment = new Map(apps.map((a) => [a.student.enrollmentNo.toLowerCase(), a.id]));
  const results: ResultInput[] = [];
  const rowErrors: { row: number; reason: string }[] = [];
  for (const { row, data } of rows) {
    const applicationId = byEnrollment.get(data.enrollment_no.toLowerCase());
    const status = MAP[data.result.toLowerCase()];
    const score = data.score === "" ? undefined : Number(data.score);
    if (!applicationId) rowErrors.push({ row, reason: `No application found for "${data.enrollment_no}" in this drive` });
    else if (!status) rowErrors.push({ row, reason: `Unknown result "${data.result}"` });
    else if (score !== undefined && !Number.isFinite(score)) rowErrors.push({ row, reason: `Score "${data.score}" is not a number` });
    else results.push({ applicationId, status, score, remarks: data.remarks || undefined });
  }
  if (!results.length) throw badRequest("No usable rows in the file", { rowErrors: rowErrors.slice(0, 50) });

  const run = async () => ({ ...(await recordRoundResults(s, id, roundId, results)), rowErrors });
  if (results.length < 2) return run();
  return gate(s, "BULK_STATUS_CHANGE", `Record ${results.length} round results from "${file.name}" for "${drive.role}"`, { kind: "results", driveId: id, roundId, results }, run);
});
