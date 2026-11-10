import { db } from "@/lib/db";
import type { SectionData } from "@/lib/resume";
import { buildResumePdf } from "@/lib/resumePdf";
import type { ProfileSection } from "@/generated/prisma/client";
import { sortedAchievements } from "@/lib/achievements";
import { portfolioFor } from "@/lib/projectService";
import { internshipRecords } from "@/lib/internshipService";

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
  const [st, { verified }, college, courses, work, interns] = await Promise.all([
    db.student.findUniqueOrThrow({ where: { id: studentId }, include: { department: { select: { name: true } }, batch: { select: { name: true } } } }),
    resumeSections(studentId),
    db.college.findUniqueOrThrow({ where: { id: collegeId }, select: { name: true, brandColor: true } }),
    db.courseEnrolment.findMany({ where: { studentId, status: "COMPLETED" }, orderBy: { completedAt: "desc" }, take: 15, select: { completedAt: true, course: { select: { title: true } } } }),
    portfolioFor(studentId, { onlyShown: true }),
    internshipRecords(studentId),
  ]);
  if (!Object.keys(verified).length) return null;
  const pdf = await buildResumePdf({
    college: college.name, brandColor: college.brandColor, name: st.name,
    contact: [st.email, st.phone ?? "", `${st.department.name}, ${st.batch.name}`, st.enrollmentNo].filter(Boolean),
    blocks: [
      { heading: "Summary", data: verified.RESUME?.summary }, { heading: "Academics", data: verified.ACADEMICS }, { heading: "Education", data: verified.EDUCATION_HISTORY },
      { heading: "Skills", data: verified.SKILLS }, { heading: "Projects", data: verified.PROJECTS }, { heading: "Internships", data: verified.INTERNSHIPS }, { heading: "Achievements", data: verified.ACHIEVEMENTS ? sortedAchievements(verified.ACHIEVEMENTS).map(({ title, position, issuer, level, date }) => ({ title, position, issuer, level, date })) : undefined }, { heading: "College internship records", data: interns.length ? interns.map((i) => ({ company: i.company ?? undefined, role: i.role, period: `${i.from} to ${i.to}`, note: [i.certificateVerified ? "certificate verified" : "", i.preplacementOffer ? "pre-placement offer accepted" : ""].filter(Boolean).join(", ") || undefined })) : undefined }, { heading: "College project work", data: work.length ? work.slice(0, 6).map((w) => ({ project: w.title, role: w.myRole ?? undefined, skills: w.skills.join(", ") || undefined, repo: w.repoUrl ?? undefined, result: w.myResultPercent !== null ? `${w.myResultPercent}%` : undefined })) : undefined }, { heading: "Courses completed", data: courses.length ? courses.map((c) => ({ course: c.course.title, completed: c.completedAt?.toISOString().slice(0, 10) })) : undefined }, { heading: "Personal details", data: verified.PERSONAL },
    ],
  });
  return { pdf, fileName: `resume-${st.enrollmentNo}.pdf` };
}
