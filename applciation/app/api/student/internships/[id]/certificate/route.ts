import { studentRoute } from "@/lib/api/studentHandler";
import { readForm } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { notifyStaff } from "@/lib/notify";
import { DOC_MAX_BYTES } from "@/lib/documents";
import { myInternship, removeFile, storeProof } from "@/lib/internshipService";

/** Upload the completion certificate (multipart "file": PDF, PNG or JPEG up to 10 MB), once the internship is ongoing and near its end or complete. Staff verify it. */
export const POST = studentRoute<{ id: string }>({ module: "INTERNSHIPS", limit: { name: "internship-cert", max: 10, windowSec: 3600 } }, async (req, me, { id }) => {
  const i = await myInternship(me, id);
  if (i.status !== "ONGOING" && i.status !== "COMPLETED") throw badRequest("You can upload the certificate once the internship has started");
  if (i.certificateStatus === "VERIFIED") throw badRequest("Your certificate was already verified");
  const file = (await readForm(req, DOC_MAX_BYTES)).get("file");
  if (!(file instanceof File)) throw badRequest('Send the certificate as multipart field "file"');
  const saved = await storeProof(me.collegeId, id, "certificate", file);
  await db.internship.update({ where: { id }, data: { certificatePath: saved.path, certificateName: saved.name, certificateMime: saved.mime, certificateStatus: "PENDING", certificateNote: null, certificateUploadedAt: new Date() } });
  await removeFile(i.certificatePath);
  await notifyStaff(me.collegeId, { type: "internship.certificate", title: `${me.name} uploaded an internship certificate`, link: `/staff/internships/${id}`, departmentId: me.departmentId });
  return { certificateStatus: "PENDING" };
});
