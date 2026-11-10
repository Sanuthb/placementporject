import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyStudent } from "@/lib/notify";
import { INT_ADMIN, internshipOf } from "@/lib/internshipService";

/** Verifies or rejects the completion certificate the student uploaded. Rejecting needs a reason the student can act on. */
export const PATCH = route<{ id: string }>(INT_ADMIN, async (req, s, { id }) => {
  const i = await internshipOf(s, id);
  const { decision, note } = await parseBody(req, z.object({ decision: z.enum(["VERIFY", "REJECT"]), note: z.string().trim().max(500).optional() }));
  if (i.certificateStatus !== "PENDING") throw badRequest("There is no certificate waiting for review");
  if (decision === "REJECT" && !(note && note.length >= 3)) throw badRequest("Say why it is rejected");
  const status = decision === "VERIFY" ? "VERIFIED" : "REJECTED";
  await db.internship.update({ where: { id }, data: { certificateStatus: status, certificateNote: note ?? null } });
  await notifyStudent(s.collegeId, i.studentId, { type: "internship.certificate", title: decision === "VERIFY" ? "Your internship certificate was verified" : "Your internship certificate was not accepted", body: note, link: "/student/internships" });
  await audit(s, { action: `internship.certificate.${decision.toLowerCase()}`, entity: "Internship", entityId: id, reason: note });
  return { certificateStatus: status };
});
