import { composeDoc } from "@/lib/resumeEngine";
import { renderPdf } from "@/lib/resumeRender";
import { loadMaster } from "@/lib/resumeService";
import { db } from "@/lib/db";
import type { SectionData } from "@/lib/resume";
import type { ProfileSection } from "@/generated/prisma/client";

/** Section content for resume work: `all` includes drafts (for feedback), `verified` only staff-approved data (for the generated resume). */
export async function resumeSections(studentId: string) {
  const rows = await db.studentSection.findMany({ where: { studentId }, select: { section: true, status: true, data: true } });
  const all: SectionData = {}, verified: SectionData = {};
  for (const r of rows) {
    const d = r.data as Record<string, unknown>;
    all[r.section as ProfileSection] = d;
    if (r.status === "VERIFIED") verified[r.section as ProfileSection] = d;
  }
  return { all, verified, resumeVerified: rows.some((r) => r.section === "RESUME" && r.status === "VERIFIED") };
}

/**
 * The college-format resume PDF that staff, recruiters and the shareable profile use: the master profile, only what staff have checked or the college's own
 * records back, in the college's colour. Private details (date of birth, address, family) are never printed. Returns null when there is nothing to show.
 */
export async function generateResumePdf(collegeId: string, studentId: string) {
  const [master, college, st] = await Promise.all([
    loadMaster(collegeId, studentId),
    db.college.findUniqueOrThrow({ where: { id: collegeId }, select: { name: true, brandColor: true } }),
    db.student.findUniqueOrThrow({ where: { id: studentId }, select: { enrollmentNo: true } }),
  ]);
  const doc = composeDoc(master, { kind: "MASTER", claims: "VERIFIED_ONLY", markEvidence: false });
  if (!doc.sections.length) return null;
  const pdf = await renderPdf(doc, "MODERN", { college: college.name, brandColor: college.brandColor, markEvidence: false });
  return { pdf, fileName: `resume-${st.enrollmentNo}.pdf` };
}
