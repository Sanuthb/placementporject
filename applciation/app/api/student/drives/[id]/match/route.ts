import { studentRoute } from "@/lib/api/studentHandler";
import { db } from "@/lib/db";
import { jdData } from "@/lib/jd";
import { matchStudent } from "@/lib/matching";
import { prepFor } from "@/lib/matchingService";
import { loadMaster } from "@/lib/resumeService";

/**
 * How I match a published drive whose job description is approved: my score by area, each requirement with what backs it, my skills matched, partly matched and
 * missing, and what the college offers for the gaps. It uses only my own records, never my personality or interest results, and it does not decide anything.
 */
export const GET = studentRoute<{ id: string }>({ module: "DRIVES", limit: { name: "my-match", max: 120, windowSec: 3600 } }, async (_req, me, { id }) => {
  const d = await db.drive.findFirst({ where: { id, collegeId: me.collegeId, status: { in: ["PUBLISHED", "CLOSED"] } }, select: { id: true } });
  const jd = d ? await db.jobDescription.findUnique({ where: { driveId: id } }) : null;
  if (!jd || jd.status !== "APPROVED") return { available: false as const };
  const data = jdData.parse(jd.data);
  const res = matchStudent(data, await loadMaster(me.collegeId, me.studentId));
  return { available: true as const, score: res.score, parameters: res.parameters.map((p) => ({ label: p.label, weight: p.weight, value: p.value, note: p.note })), requirements: res.requirements.map((r) => ({ level: r.level, text: r.text, status: r.status, evidence: r.evidence, note: r.note ?? null })), skills: res.skills, mandatory: res.mandatory, explanation: res.explanation, preparation: await prepFor(me.collegeId, res.gaps) };
});
