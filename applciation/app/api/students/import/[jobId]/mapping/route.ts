import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { loadJob, saveJobData } from "@/lib/import/job";
import { FIELDS, applyMapping, countResults, validateRows } from "@/lib/import/students";

const body = z.object({ mapping: z.record(z.string(), z.string()) });

/** Step 2: save which column feeds which field, then check every row and report the totals. Changing the mapping discards row corrections. */
export const PUT = route<{ jobId: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (req, s, { jobId }) => {
  const { mapping: asked } = await parseBody(req, body);
  const { data } = await loadJob(s, jobId);
  const keys = new Set<string>(FIELDS.map((f) => f.key));
  const mapping: Record<string, string> = {};
  const used = new Set<string>();
  for (const [field, header] of Object.entries(asked)) {
    if (!header) continue;
    if (!keys.has(field)) throw badRequest(`Unknown field "${field}"`);
    if (!data.headers.includes(header)) throw badRequest(`The file has no column "${header}"`);
    if (used.has(header)) throw badRequest(`Column "${header}" is mapped to more than one field`);
    used.add(header);
    mapping[field] = header;
  }
  const missing = FIELDS.filter((f) => f.required && !mapping[f.key]).map((f) => f.label);
  if (missing.length) throw badRequest(`Map a column for: ${missing.join(", ")}`, { missing });

  const next = { ...data, mapping, rows: applyMapping(data.raw, mapping), excluded: [] };
  await saveJobData(jobId, next);
  return { mapping, counts: countResults(await validateRows(s.collegeId, next.rows)) };
});
