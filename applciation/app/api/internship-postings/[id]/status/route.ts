import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { INT_ADMIN } from "@/lib/internshipService";
import { postingProblems } from "@/lib/internships";

/** OPEN (needs the company's confirmation and a future deadline), CLOSE (no new applications; existing ones continue) or CANCEL. */
export const POST = route<{ id: string }>(INT_ADMIN, async (req, s, { id }) => {
  const p = await db.internshipPosting.findFirst({ where: { id, collegeId: s.collegeId } });
  if (!p) throw notFound("Posting not found");
  const { action } = await parseBody(req, z.object({ action: z.enum(["OPEN", "CLOSE", "CANCEL"]) }));
  if (action === "OPEN") {
    if (p.status === "CANCELLED") throw badRequest("A cancelled posting cannot be opened");
    const problems = postingProblems(p);
    if (problems.length) throw badRequest(problems[0], problems);
  }
  const status = { OPEN: "OPEN", CLOSE: "CLOSED", CANCEL: "CANCELLED" }[action] as "OPEN" | "CLOSED" | "CANCELLED";
  if (status === p.status) return p;
  const u = await db.internshipPosting.update({ where: { id }, data: { status } });
  await audit(s, { action: `internship_posting.${status.toLowerCase()}`, entity: "InternshipPosting", entityId: id, before: { status: p.status }, after: { status } });
  return u;
});
