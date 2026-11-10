import { route } from "@/lib/api/handler";
import { readForm } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { RES_STAFF, resourceOf, storeResourceFile } from "@/lib/resourceService";
import { MAX_UPLOAD } from "@/lib/resources";

/**
 * Uploads the file (multipart field "file"). On an approved resource this is a new version: the earlier one is kept in the history, the resource
 * goes back to review, and students stop seeing it until it is approved again. The resource's type follows the file.
 */
export const POST = route<{ id: string }>(RES_STAFF, async (req, s, { id }) => {
  const r = await resourceOf(s.collegeId, id);
  if (r.status === "ARCHIVED") throw badRequest("Restore the resource before replacing its file");
  const file = (await readForm(req, MAX_UPLOAD)).get("file");
  if (!(file instanceof File)) throw badRequest('Send the file as multipart field "file"');
  const saved = await storeResourceFile(s.collegeId, id, file);
  const hadContent = !!(r.filePath || r.url);
  const newVersion = hadContent && r.status === "APPROVED";
  const u = await db.$transaction(async (tx) => {
    if (hadContent && (r.filePath || newVersion)) await tx.resourceVersion.upsert({ where: { resourceId_version: { resourceId: id, version: r.version } }, create: { resourceId: id, version: r.version, url: r.url, filePath: r.filePath, fileName: r.fileName, mimeType: r.mimeType, sizeBytes: r.sizeBytes, createdById: r.uploadedById }, update: {} });
    return tx.prepResource.update({ where: { id }, data: { ...saved, url: null, version: hadContent ? r.version + 1 : r.version, ...(newVersion ? { status: "IN_REVIEW", reviewedAt: null, reviewedById: null } : {}) } });
  });
  await audit(s, { action: "resource.file", entity: "PrepResource", entityId: id, after: { version: u.version, fileName: saved.fileName } });
  return { version: u.version, status: u.status, type: u.type };
});
