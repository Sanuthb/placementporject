import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { notFound } from "@/lib/api/errors";
import { listOf } from "@/lib/resume";
import { sortedAchievements } from "@/lib/achievements";

export const newToken = () => randomBytes(32).toString("base64url");

/** Public profile for a showcase link. Only verified data, and only what the student chose to reveal. Unknown, disabled, expired and module-off links all look identical (404). */
export async function publicProfile(token: string) {
  const p = await db.showcaseProfile.findUnique({ where: { token }, include: { student: { include: { department: { select: { name: true } }, batch: { select: { name: true } }, sections: { where: { status: "VERIFIED" }, select: { section: true, data: true } } } } } });
  const live = p && p.isEnabled && (!p.expiresAt || p.expiresAt > new Date()) && p.student.isActive && !p.student.isArchived;
  if (!live) throw notFound("Profile not found");
  const mod = await db.collegeModule.findUnique({ where: { collegeId_module: { collegeId: p.collegeId, module: "TALENT_SHOWCASE" } } });
  if (!mod?.enabled) throw notFound("Profile not found");
  const sec = (name: string) => p.student.sections.find((x) => x.section === name)?.data as Record<string, unknown> | undefined;
  const college = await db.college.findUniqueOrThrow({ where: { id: p.collegeId }, select: { name: true, logoUrl: true, brandColor: true } });
  await db.showcaseProfile.update({ where: { id: p.id }, data: { views: { increment: 1 } } });
  return {
    college, name: p.student.name, headline: p.headline, department: p.student.department.name, batch: p.student.batch.name,
    ...(p.showCgpa ? { cgpa: (sec("ACADEMICS") as { cgpa?: number } | undefined)?.cgpa ?? null } : {}),
    ...(p.showContact ? { contact: { email: p.student.email, phone: p.student.phone } } : {}),
    summary: sec("RESUME")?.summary ?? null, skills: listOf(sec("SKILLS"), "skills"), projects: listOf(sec("PROJECTS"), "projects"), internships: listOf(sec("INTERNSHIPS"), "internships"), achievements: sortedAchievements(sec("ACHIEVEMENTS")), education: sec("EDUCATION_HISTORY") ?? null,
    studentId: p.studentId, collegeId: p.collegeId,
  };
}
