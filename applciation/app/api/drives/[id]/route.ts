import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertDriveRefs, checkDriveShape, getDrive, patchDriveSchema } from "@/lib/drives";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const GET = route<{ id: string }>({ module: "DRIVES" }, async (_req, s, { id }) => {
  const d = await db.drive.findFirst({
    where: { id, collegeId: s.collegeId },
    include: { company: { select: { id: true, name: true, tier: true } }, rounds: { orderBy: { order: "asc" } }, documents: true, _count: { select: { applications: true, exceptions: true } } },
  });
  if (!d) throw notFound("Drive not found");
  const bucket = supabaseAdmin().storage.from("drive-documents");
  const documents = await Promise.all(d.documents.map(async (x) => ({ id: x.id, fileName: x.fileName, mimeType: x.mimeType, sizeBytes: x.sizeBytes, url: (await bucket.createSignedUrl(x.storagePath, 600)).data?.signedUrl ?? null })));
  return { ...d, documents };
});

export const PATCH = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (req, s, { id }) => {
  const data = await parseBody(req, patchDriveSchema);
  const before = await getDrive(s.collegeId, id);
  if (before.status === "CLOSED" || before.status === "CANCELLED") throw new ApiError(409, "CONFLICT", `A ${before.status.toLowerCase()} drive cannot be edited`);
  checkDriveShape({
    packageMinLpa: data.packageMinLpa ?? (before.packageMinLpa && Number(before.packageMinLpa)),
    packageMaxLpa: data.packageMaxLpa ?? (before.packageMaxLpa && Number(before.packageMaxLpa)),
    applicationDeadline: data.applicationDeadline ?? before.applicationDeadline,
    driveDate: data.driveDate ?? before.driveDate,
  });
  await assertDriveRefs(s.collegeId, data);
  return db.$transaction(async (tx) => {
    const after = await tx.drive.update({ where: { id }, data });
    // Rule changes on a live drive are the sensitive ones, so they are recorded explicitly.
    await audit(s, { action: before.status === "PUBLISHED" ? "drive.update.published" : "drive.update", entity: "Drive", entityId: id, after: data as object }, tx);
    return after;
  });
});
