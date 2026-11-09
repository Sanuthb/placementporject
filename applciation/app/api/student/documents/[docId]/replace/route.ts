import { studentRoute } from "@/lib/api/studentHandler";
import { readForm } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { assertDocumentReplaceable } from "@/lib/invitations/guard";
import { DOC_MAX_BYTES } from "@/lib/documents";
import { addDocument } from "@/lib/documentStore";

/** Replace one of my documents (multipart field "file"). The new file is checked again by staff; the old one is kept as history. Allowed even after verification. */
export const POST = studentRoute<{ docId: string }>({ module: "ONBOARDING", limit: { name: "student-upload", max: 100, windowSec: 3600 } }, async (req, me, { docId }) => {
  const file = (await readForm(req, DOC_MAX_BYTES)).get("file");
  if (!(file instanceof File)) throw badRequest('Send the document as multipart field "file"');
  await assertDocumentReplaceable(me.studentId);
  return addDocument({ ctx: { collegeId: me.collegeId, userId: null }, studentId: me.studentId, file, category: "OTHER", replacesId: docId });
});
