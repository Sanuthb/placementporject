import { studentRoute } from "@/lib/api/studentHandler";
import { db } from "@/lib/db";
import { ProfileSection } from "@/generated/prisma/client";
import { DEFAULT_REQUIRED_SECTIONS } from "@/lib/verification";

/** My profile sections and where each stands (draft, submitted, changes requested, verified). */
export const GET = studentRoute({ module: "ONBOARDING" }, async (_req, me) => {
  const [rows, st, settings] = await Promise.all([
    db.studentSection.findMany({ where: { studentId: me.studentId }, select: { section: true, status: true, submittedAt: true, reviewedAt: true, reviewComment: true, pendingData: true } }),
    db.student.findUniqueOrThrow({ where: { id: me.studentId }, select: { stage: true } }),
    db.collegeSettings.findUnique({ where: { collegeId: me.collegeId }, select: { requiredSections: true } }),
  ]);
  const required = new Set(settings?.requiredSections?.length ? settings.requiredSections : DEFAULT_REQUIRED_SECTIONS);
  return {
    stage: st.stage,
    sections: Object.values(ProfileSection).map((section) => {
      const r = rows.find((x) => x.section === section);
      return { section, required: required.has(section), status: r?.status ?? "DRAFT", submittedAt: r?.submittedAt ?? null, reviewedAt: r?.reviewedAt ?? null, reviewComment: r?.reviewComment ?? null, hasPendingRevision: !!r?.pendingData };
    }),
  };
});
