import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { RES_STAFF, removeFile, resourceEffectiveness, resourceOf, signed } from "@/lib/resourceService";
import { expiryState } from "@/lib/resources";
import { clean, metaFields } from "../route";

type P = { id: string };

/** One resource with its versions, assignments and how it is doing. */
export const GET = route<P>(RES_STAFF, async (_req, s, { id }) => {
  const r = await resourceOf(s.collegeId, id);
  const [versions, assignments, eff] = await Promise.all([
    db.resourceVersion.findMany({ where: { resourceId: id }, orderBy: { version: "desc" } }),
    db.resourceAssignment.findMany({ where: { resourceId: id }, orderBy: { createdAt: "desc" } }),
    resourceEffectiveness(s.collegeId, id, r.category),
  ]);
  const ids = (t: string) => assignments.flatMap((a) => (a.targetType === t && a.targetId ? [a.targetId] : []));
  const [studs, deps, bats, grps, papers] = await Promise.all([
    db.student.findMany({ where: { id: { in: ids("STUDENT") } }, select: { id: true, name: true } }), db.department.findMany({ where: { id: { in: ids("DEPARTMENT") } }, select: { id: true, name: true } }),
    db.batch.findMany({ where: { id: { in: ids("BATCH") } }, select: { id: true, name: true } }), db.learningProgramme.findMany({ where: { id: { in: ids("GROUP") } }, select: { id: true, title: true } }),
    db.assessmentPaper.findMany({ where: { id: { in: ids("MOCK_TEST") } }, select: { id: true, title: true } }),
  ]);
  const names = new Map<string, string>([...studs, ...deps, ...bats].map((x) => [x.id, x.name] as [string, string]).concat([...grps, ...papers].map((x) => [x.id, x.title] as [string, string])));
  const labelled = assignments.map((a) => ({ ...a, label: a.targetType === "SKILL_GAP" ? `Students weak in ${a.targetKey}` : (names.get(a.targetId ?? "") ?? "(removed)") }));
  const { filePath, ...rest } = r;
  return { ...rest, hasFile: !!filePath, fileUrl: filePath ? await signed(filePath) : null, expiry: expiryState(r.expiresAt), assignments: labelled, versions: versions.map((v) => ({ id: v.id, version: v.version, url: v.url, fileName: v.fileName, hasFile: !!v.filePath, createdAt: v.createdAt })), effectiveness: eff };
});

/** Edits the details. Changing the link of an approved resource starts a new version that must be approved again. */
export const PATCH = route<P>(RES_STAFF, async (req, s, { id }) => {
  const r = await resourceOf(s.collegeId, id);
  const b = clean(await parseBody(req, metaFields.partial()));
  const linkChanged = b.url !== undefined && b.url !== r.url;
  if (r.status === "ARCHIVED") throw badRequest("Restore the resource before editing it");
  const data = { ...b, ...(linkChanged && r.status === "APPROVED" ? { status: "IN_REVIEW" as const, version: r.version + 1, reviewedAt: null, reviewedById: null } : {}) };
  if (linkChanged && r.status === "APPROVED") await db.resourceVersion.create({ data: { resourceId: id, version: r.version, url: r.url, filePath: r.filePath, fileName: r.fileName, mimeType: r.mimeType, sizeBytes: r.sizeBytes, createdById: r.uploadedById } });
  const u = await db.prepResource.update({ where: { id }, data });
  await audit(s, { action: "resource.update", entity: "PrepResource", entityId: id, before: { title: r.title, status: r.status }, after: { title: u.title, status: u.status } });
  return u;
});

/** Deletes a draft nobody has used. Anything else is archived, so students' progress and feedback are kept. */
export const DELETE = route<P>(RES_STAFF, async (_req, s, { id }) => {
  const r = await resourceOf(s.collegeId, id);
  const [used, vers] = await Promise.all([db.resourceProgress.count({ where: { resourceId: id } }), db.resourceVersion.findMany({ where: { resourceId: id }, select: { filePath: true } })]);
  if ((r.status !== "DRAFT" && r.status !== "REJECTED") || used > 0) throw badRequest("Only a draft nobody has used can be deleted. Archive the resource instead");
  await db.prepResource.delete({ where: { id } });
  await Promise.all([removeFile(r.filePath), ...vers.map((v) => removeFile(v.filePath))]);
  await audit(s, { action: "resource.delete", entity: "PrepResource", entityId: id, before: { title: r.title } });
  return { ok: true };
});
