import { db } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { academicsDraft, careerDraft, computeMissing, EDITABLE, personalDraft, requiredDocuments } from "@/lib/invitations/onboarding";

export const BUCKET = "student-documents";
export const DEFAULT_DECLARATION = "I declare that the information and documents I provide are true and complete. I understand that false information can lead to rejection of my profile and removal from placement activities, and I agree that the institution may verify it and share it with recruiting companies for placement purposes.";

/** Everything the onboarding wizard shows, in one read. Documents come with short-lived links because the files are never public. */
export async function loadWizard(studentId: string, collegeId: string) {
  const st = await db.student.findUniqueOrThrow({
    where: { id: studentId },
    include: {
      college: { select: { name: true, logoUrl: true, brandColor: true } },
      campus: { select: { name: true } }, department: { select: { name: true } }, program: { select: { name: true } }, branch: { select: { name: true } }, batch: { select: { name: true, endYear: true } }, currentAcademicYear: { select: { name: true } }, currentSemester: { select: { name: true } },
      invitation: { select: { invitedEmail: true, admissionYear: true, graduationYear: true } },
      onboardingProfile: true,
      educationRecords: { orderBy: [{ completionYear: "asc" }, { createdAt: "asc" }] },
      documents: { where: { archivedAt: null }, orderBy: { createdAt: "desc" } },
      sections: { select: { section: true, status: true, reviewComment: true } },
      correctionRequests: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  const settings = await db.collegeSettings.findUnique({ where: { collegeId }, select: { dataDeclaration: true } });
  const profile = st.onboardingProfile;
  const personal = personalDraft.parse({ fullName: st.name, ...(profile?.personal as object | undefined) });
  const academics = academicsDraft.parse(profile?.academics ?? {});
  const career = careerDraft.parse(profile?.career ?? {});
  const declaration = settings?.dataDeclaration?.trim() || DEFAULT_DECLARATION;

  const bucket = supabaseAdmin().storage.from(BUCKET);
  const documents = await Promise.all(st.documents.map(async (d) => ({
    id: d.id, category: d.category, fileName: d.fileName, mimeType: d.mimeType, sizeBytes: d.sizeBytes, status: d.status, rejectReason: d.rejectReason, createdAt: d.createdAt,
    url: (await bucket.createSignedUrl(d.storagePath, 600)).data?.signedUrl ?? null,
  })));
  const education = st.educationRecords.map((e) => ({ ...e, percentage: e.percentage == null ? null : Number(e.percentage), cgpa: e.cgpa == null ? null : Number(e.cgpa) }));
  const accepted = !!profile?.declarationAcceptedAt;
  const missing = computeMissing({ personal, academics, education, documents: st.documents, declarationAccepted: accepted });

  return {
    status: st.onboardingStatus,
    editable: EDITABLE.includes(st.onboardingStatus),
    currentStep: profile?.currentStep ?? 1,
    institution: st.college,
    assigned: {
      institution: st.college.name, campus: st.campus?.name ?? null, department: st.department.name, programme: st.program?.name ?? null, branch: st.branch?.name ?? null,
      academicYear: st.currentAcademicYear?.name ?? null, semester: st.currentSemester?.name ?? null, admissionNumber: st.enrollmentNo, admissionYear: st.invitation?.admissionYear ?? st.admissionYear, batch: st.batch.name, graduationYear: st.invitation?.graduationYear ?? st.batch.endYear,
      invitedName: st.name, invitedEmail: st.invitation?.invitedEmail ?? st.email,
    },
    personal, academics, career, education, documents,
    requiredDocuments: requiredDocuments(education),
    declaration: { text: declaration, acceptedAt: profile?.declarationAcceptedAt ?? null },
    nameReview: profile?.proposedName && profile.proposedName !== st.name ? { invited: st.name, entered: profile.proposedName, decidedAt: profile.nameDecidedAt } : null,
    reviewNote: profile?.reviewNote ?? null,
    sections: st.sections,
    corrections: st.correctionRequests.map((c) => ({ id: c.id, field: c.field, message: c.message, status: c.status, createdAt: c.createdAt })),
    missing,
  };
}
