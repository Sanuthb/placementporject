import { recruiterRoute, recruiterDrive } from "@/lib/api/recruiterHandler";
import { db } from "@/lib/db";
import { notFound } from "@/lib/api/errors";
import { jdData } from "@/lib/jd";
import { matchStudent } from "@/lib/matching";
import { loadMaster } from "@/lib/resumeService";

/**
 * Why a shortlisted candidate matches your drive, with the evidence: required criteria, skills matched, partly matched and missing, relevant projects and internships, and the score by area.
 * Only for candidates the college has shortlisted to your drive, and only when the drive has an approved job description. Selection stays with you and the college.
 */
export const GET = recruiterRoute<{ id: string; studentId: string }>(async (_req, r, { id, studentId }) => {
  await recruiterDrive(r, id);
  const app = await db.application.findFirst({ where: { driveId: id, studentId, status: "SHORTLISTED" }, select: { id: true } });
  if (!app) throw notFound("Candidate not found");
  const jd = await db.jobDescription.findUnique({ where: { driveId: id } });
  if (!jd || jd.status !== "APPROVED") return { available: false as const };
  const res = matchStudent(jdData.parse(jd.data), await loadMaster(r.collegeId, studentId));
  return { available: true as const, score: res.score, parameters: res.parameters.map((p) => ({ label: p.label, weight: p.weight, value: p.value, note: p.note })), mandatory: res.mandatory, requirements: res.requirements.map((q) => ({ level: q.level, text: q.text, status: q.status, evidence: q.evidence })), skills: res.skills, projects: res.projects, internships: res.internships, explanation: res.explanation };
});
