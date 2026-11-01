import { db } from "@/lib/db";
import type { SectionData } from "@/lib/resume";
import { buildResumePdf } from "@/lib/resumePdf";
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

/** The college-format resume PDF, built only from verified sections. Returns null when nothing is verified yet. */
export async function generateResumePdf(collegeId: string, studentId: string) {
  const [st, { verified }, college] = await Promise.all([
    db.student.findUniqueOrThrow({ where: { id: studentId }, include: { department: { select: { name: true } }, batch: { select: { name: true } } } }),
    resumeSections(studentId),
    db.college.findUniqueOrThrow({ where: { id: collegeId }, select: { name: true, brandColor: true } }),
  ]);
  if (!Object.keys(verified).length) return null;
  const pdf = await buildResumePdf({
    college: college.name, brandColor: college.brandColor, name: st.name,
    contact: [st.email, st.phone ?? "", `${st.department.name}, ${st.batch.name}`, st.enrollmentNo].filter(Boolean),
    blocks: [
      { heading: "Summary", data: verified.RESUME?.summary }, { heading: "Academics", data: verified.ACADEMICS }, { heading: "Education", data: verified.EDUCATION_HISTORY },
      { heading: "Skills", data: verified.SKILLS }, { heading: "Projects", data: verified.PROJECTS }, { heading: "Internships", data: verified.INTERNSHIPS }, { heading: "Personal details", data: verified.PERSONAL },
    ],
  });
  return { pdf, fileName: `resume-${st.enrollmentNo}.pdf` };
}
