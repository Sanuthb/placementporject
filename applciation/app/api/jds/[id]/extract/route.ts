import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertAiReadingEnabled } from "@/lib/documentAi";
import { extractJd } from "@/lib/jdAi";
import { matchNames } from "@/lib/jd";
import { JD_ADMIN, dataOf, jdOf } from "@/lib/jdService";

/**
 * Read the job description with the AI: company, title, requirements (each marked mandatory or preferred, with the words they came from), marks and backlog rules,
 * branches, salary, location, selection process. The college must have switched on AI document reading, because the text is sent to the AI provider. Anything the
 * AI could not find word for word in the document is flagged for a person to check. Replaces what is in the form; pass overwrite to confirm when it already has edits.
 */
export const POST = route<{ id: string }>({ ...JD_ADMIN, limit: { name: "jd-extract", max: 40, windowSec: 3600 } }, async (req, s, { id }) => {
  const j = await jdOf(s.collegeId, id);
  const { overwrite } = await parseBody(req, z.object({ overwrite: z.boolean().default(false) }));
  if (j.status === "APPROVED" || j.status === "ARCHIVED") throw badRequest("An approved job description cannot be changed. Ask the admin to reopen it");
  if (!j.rawText) throw badRequest("There is no text to read. Upload a file or paste the job description");
  if (!overwrite && dataOf(j).requirements.length > 0) throw badRequest("This job description already has requirements. Confirm to replace them with a fresh reading");
  await assertAiReadingEnabled(s.collegeId);
  const { data, notes } = await extractJd(j.rawText);
  const [deps, progs] = await Promise.all([db.department.findMany({ where: { collegeId: s.collegeId, isActive: true }, select: { id: true, name: true, code: true } }), db.program.findMany({ where: { collegeId: s.collegeId, isActive: true }, select: { id: true, name: true, code: true } })]);
  const branches = data.eligibility.branchesAsStated;
  const md = matchNames(branches, deps), mp = matchNames(branches.filter((b) => md.unmatched.includes(b)), progs);
  data.eligibility.departmentIds = md.ids; data.eligibility.programIds = mp.ids;
  const left = mp.unmatched;
  if (left.length) notes.push(`These branches match none of your departments or programmes: ${left.join(", ")}. Choose the right ones by hand.`);
  if (md.ids.length || mp.ids.length) notes.push("Branches were matched to your departments and programmes. Check them.");
  const matched = new Set(data.eligibility.branchesAsStated.filter((b) => !left.includes(b)));
  if (matched.size === branches.length) data.eligibility.branchesAsStated = [];
  await db.jobDescription.update({ where: { id }, data: { data: data as object, title: data.title || j.title, companyName: data.company || j.companyName, extractionNotes: notes, extractedAt: new Date(), status: "DRAFT", submittedAt: null } });
  await audit(s, { action: "jd.extract", entity: "JobDescription", entityId: id, after: { requirements: data.requirements.length, flagged: data.requirements.filter((r) => r.needsCheck).length } });
  return { requirements: data.requirements.length, flagged: data.requirements.filter((r) => r.needsCheck).length, notes };
});
