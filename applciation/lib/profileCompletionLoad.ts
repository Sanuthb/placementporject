import { db } from "@/lib/db";
import { DEFAULT_REQUIRED_SECTIONS, OPTIONAL_SECTIONS } from "@/lib/verification";
import { requiredDocuments } from "@/lib/invitations/onboarding";
import { computeCompletion, type Completion } from "@/lib/profileCompletion";

/** True when saved section content holds anything a person typed (an empty list or blank strings do not count). */
export function hasContent(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (typeof v === "number" || typeof v === "boolean") return true;
  if (Array.isArray(v)) return v.some(hasContent);
  if (typeof v === "object") return Object.values(v as object).some(hasContent);
  return false;
}

/** The required sections for a college: its own choice, or the default list (which never includes optional sections). */
export async function requiredSectionsFor(collegeId: string) {
  const s = await db.collegeSettings.findUnique({ where: { collegeId }, select: { requiredSections: true } });
  return s?.requiredSections?.length ? s.requiredSections : DEFAULT_REQUIRED_SECTIONS;
}

/** Completion for many students in four queries. Students not found in this college are left out of the map. */
export async function completionFor(collegeId: string, studentIds: string[]): Promise<Map<string, Completion>> {
  const out = new Map<string, Completion>();
  if (!studentIds.length) return out;
  const where = { studentId: { in: studentIds }, collegeId };
  const [required, students, sections, documents, education] = await Promise.all([
    requiredSectionsFor(collegeId),
    db.student.findMany({ where: { id: { in: studentIds }, collegeId }, select: { id: true, onboardingStatus: true } }),
    db.studentSection.findMany({ where, select: { studentId: true, section: true, status: true, reviewComment: true, data: true, pendingData: true } }),
    db.studentDocument.findMany({ where: { ...where, archivedAt: null }, select: { studentId: true, category: true, status: true, fileName: true, rejectReason: true } }),
    db.studentEducationRecord.findMany({ where, select: { studentId: true, level: true, qualification: true } }),
  ]);
  const by = <T extends { studentId: string }>(rows: T[]) => { const m = new Map<string, T[]>(); for (const r of rows) (m.get(r.studentId) ?? m.set(r.studentId, []).get(r.studentId)!).push(r); return m; };
  const secBy = by(sections), docBy = by(documents), eduBy = by(education);
  for (const st of students) {
    out.set(st.id, computeCompletion({
      required,
      optional: OPTIONAL_SECTIONS.filter((s) => !required.includes(s)),
      onboardingStatus: st.onboardingStatus,
      sections: (secBy.get(st.id) ?? []).map((x) => ({ section: x.section, status: x.status, reviewComment: x.reviewComment, hasData: hasContent(x.pendingData ?? x.data) })),
      documents: docBy.get(st.id) ?? [],
      requiredDocuments: requiredDocuments(eduBy.get(st.id) ?? []),
    }));
  }
  return out;
}

export async function completionOf(collegeId: string, studentId: string): Promise<Completion> {
  const c = (await completionFor(collegeId, [studentId])).get(studentId);
  if (!c) throw new Error("Student not found");
  return c;
}
