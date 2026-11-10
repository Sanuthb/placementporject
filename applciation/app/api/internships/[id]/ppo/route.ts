import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyStudent } from "@/lib/notify";
import { INT_ADMIN, internshipOf } from "@/lib/internshipService";
import { ppoMove, type Ppo } from "@/lib/internships";

/**
 * Tracks the pre-placement offer: NONE, EXPECTED, OFFERED, then ACCEPTED or DECLINED. Link the offer record (one of the student's offers marked as a PPO) when there
 * is one. Only while the internship is ongoing or finished.
 */
export const PATCH = route<{ id: string }>(INT_ADMIN, async (req, s, { id }) => {
  const i = await internshipOf(s, id);
  const b = await parseBody(req, z.object({ status: z.enum(["NONE", "EXPECTED", "OFFERED", "ACCEPTED", "DECLINED"]), offerId: z.uuid().nullish(), note: z.string().trim().max(500).nullish() }));
  if (i.status !== "ONGOING" && i.status !== "COMPLETED") throw badRequest("A pre-placement offer is tracked once the internship has started");
  const move = ppoMove(i.ppoStatus as Ppo, b.status);
  if ("error" in move) throw badRequest(move.error);
  if (b.offerId && !(await db.offer.findFirst({ where: { id: b.offerId, collegeId: s.collegeId, studentId: i.studentId, isPpo: true }, select: { id: true } }))) throw badRequest("That offer is not a pre-placement offer for this student");
  await db.internship.update({ where: { id }, data: { ppoStatus: b.status, ...(b.offerId !== undefined ? { ppoOfferId: b.offerId } : {}), ...(b.note !== undefined ? { ppoNote: b.note } : {}) } });
  if (b.status === "OFFERED") await notifyStudent(s.collegeId, i.studentId, { type: "internship.ppo", title: `You have a pre-placement offer from ${i.companyName}`, link: "/student/internships" });
  await audit(s, { action: "internship.ppo", entity: "Internship", entityId: id, before: { status: i.ppoStatus }, after: { status: b.status } });
  return { ppoStatus: b.status };
});
