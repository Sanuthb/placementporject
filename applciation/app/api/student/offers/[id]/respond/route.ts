import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { respondToOffer } from "@/lib/ops/offers";

const body = z.object({ decision: z.enum(["ACCEPT", "DECLINE"]) });

/** Accepting marks me as placed. Only my own offers can be answered. */
export const POST = studentRoute<{ id: string }>({ module: "DRIVES" }, async (req, me, { id }) => {
  const { decision } = await parseBody(req, body);
  if (!(await db.offer.findFirst({ where: { id, studentId: me.studentId }, select: { id: true } }))) throw notFound("Offer not found");
  return respondToOffer({ collegeId: me.collegeId, userId: null }, id, decision);
});
