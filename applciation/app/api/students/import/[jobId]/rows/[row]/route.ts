import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { loadJob, saveJobData } from "@/lib/import/job";
import { FIELDS, countResults, validateRows } from "@/lib/import/students";

const body = z.object({ data: z.record(z.string(), z.string().max(300)).optional(), excluded: z.boolean().optional() });

/** Correct a row's values, or leave the row out of (or back in to) the import. Returns the row's new outcome and the new totals. */
export const PATCH = route<{ jobId: string; row: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (req, s, { jobId, row }) => {
  const n = Number(row);
  const b = await parseBody(req, body);
  const { data } = await loadJob(s, jobId);
  const target = data.rows.find((r) => r.row === n);
  if (!target) throw badRequest("That row is not in this import");

  const keys = new Set<string>(FIELDS.map((f) => f.key));
  for (const k of Object.keys(b.data ?? {})) if (!keys.has(k)) throw badRequest(`Unknown field "${k}"`);
  if (b.data) target.data = { ...target.data, ...b.data };
  if (b.excluded !== undefined) data.excluded = b.excluded ? [...new Set([...data.excluded, n])] : data.excluded.filter((x) => x !== n);
  await saveJobData(jobId, data);

  const results = await validateRows(s.collegeId, data.rows, new Set(data.excluded));
  const mine = results.find((r) => r.row === n)!;
  return { row: { row: mine.row, data: mine.data, status: mine.status, reasons: mine.reasons }, counts: countResults(results) };
});
