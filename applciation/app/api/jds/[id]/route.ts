import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { jdData, reviewProblems, requirementShares } from "@/lib/jd";
import { JD_ADMIN, dataOf, jdFileUrl, jdOf, removeJdFile } from "@/lib/jdService";

type P = { id: string };

/** One job description with what still has to be settled before it can be approved. The original text is included so each requirement can be checked against it. */
export const GET = route<P>(JD_ADMIN, async (_req, s, { id }) => {
  const j = await jdOf(s.collegeId, id);
  const data = dataOf(j);
  const drive = j.driveId ? await db.drive.findUnique({ where: { id: j.driveId }, select: { id: true, status: true, role: true } }) : null;
  return {
    id: j.id, status: j.status, source: j.source, title: j.title, companyName: j.companyName, companyId: j.companyId, rawText: j.rawText, fileName: j.fileName, fileUrl: await jdFileUrl(j.filePath), data,
    extractionNotes: j.extractionNotes, extractedAt: j.extractedAt, reviewNote: j.reviewNote, approvedAt: j.approvedAt, drive, problems: reviewProblems(data), shares: requirementShares(data),
  };
});

/** Edit the job description: any field, the requirements (mandatory or preferred, weights), eligibility rules, selection process and scoring weights. Not once it is approved. */
export const PATCH = route<P>(JD_ADMIN, async (req, s, { id }) => {
  const j = await jdOf(s.collegeId, id);
  const { data, companyId } = await parseBody(req, z.object({ data: jdData, companyId: z.uuid().nullish() }));
  if (j.status === "APPROVED" || j.status === "ARCHIVED") throw badRequest("An approved job description cannot be edited. Ask the admin to reopen it");
  if (companyId && !(await db.company.findFirst({ where: { id: companyId, collegeId: s.collegeId }, select: { id: true } }))) throw badRequest("Company not found");
  const ids = (xs: string[], model: "department" | "program" | "batch") => xs.length ? (db[model] as unknown as { count: (a: unknown) => Promise<number> }).count({ where: { id: { in: xs }, collegeId: s.collegeId } }).then((n) => n === new Set(xs).size) : Promise.resolve(true);
  const e = data.eligibility;
  if (!(await ids(e.departmentIds, "department")) || !(await ids(e.programIds, "program")) || !(await ids(e.batchIds, "batch"))) throw badRequest("A chosen department, programme or batch was not found");
  // Whoever edits an extracted requirement has looked at it, but a flag the person did not touch stays.
  await db.jobDescription.update({ where: { id }, data: { data: data as object, title: data.title || "Untitled job description", companyName: data.company, ...(companyId !== undefined ? { companyId } : {}), ...(j.status === "IN_REVIEW" ? { status: "DRAFT", submittedAt: null } : {}) } });
  await audit(s, { action: "jd.update", entity: "JobDescription", entityId: id, after: { requirements: data.requirements.length } });
  return { ok: true };
});

/** Delete a draft that has no drive. Anything else is archived instead. */
export const DELETE = route<P>(JD_ADMIN, async (_req, s, { id }) => {
  const j = await jdOf(s.collegeId, id);
  if (j.status !== "DRAFT" || j.driveId) throw badRequest("Only a draft with no drive can be deleted. Archive it instead");
  await db.jobDescription.delete({ where: { id } });
  await removeJdFile(j.filePath);
  await audit(s, { action: "jd.delete", entity: "JobDescription", entityId: id, before: { title: j.title } });
  return { ok: true };
});
