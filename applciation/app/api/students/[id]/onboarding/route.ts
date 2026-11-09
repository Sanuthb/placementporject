import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { scopedStudent } from "@/lib/verification";
import { requiredDocuments } from "@/lib/invitations/onboarding";
import { BUCKET } from "@/lib/invitations/wizard";

/** Everything a verifier needs on one screen: what the student entered, their documents (private links), section review state and open correction requests. */
export const GET = route<{ id: string }>({ module: "ONBOARDING" }, async (_req, s, { id }) => {
  await scopedStudent(s, id);
  const st = await db.student.findUniqueOrThrow({
    where: { id },
    include: {
      campus: { select: { name: true } }, department: { select: { name: true } }, program: { select: { name: true } }, branch: { select: { name: true } }, batch: { select: { name: true, endYear: true } },
      onboardingProfile: true,
      educationRecords: { orderBy: [{ completionYear: "asc" }, { createdAt: "asc" }] },
      documents: { where: { archivedAt: null }, orderBy: { createdAt: "asc" }, include: { verifiedBy: { select: { name: true } } } },
      sections: { orderBy: { section: "asc" } },
      correctionRequests: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  const bucket = supabaseAdmin().storage.from(BUCKET);
  const documents = await Promise.all(st.documents.map(async (d) => ({ id: d.id, category: d.category, fileName: d.fileName, mimeType: d.mimeType, sizeBytes: d.sizeBytes, status: d.status, rejectReason: d.rejectReason, verifiedAt: d.verifiedAt, verifiedBy: d.verifiedBy?.name ?? null, createdAt: d.createdAt, url: (await bucket.createSignedUrl(d.storagePath, 600)).data?.signedUrl ?? null })));
  const p = st.onboardingProfile;
  const have = new Set(st.documents.filter((d) => d.status !== "REJECTED").map((d) => d.category));
  return {
    status: st.onboardingStatus, stage: st.stage,
    student: { id: st.id, name: st.name, email: st.email, phone: st.phone, enrollmentNo: st.enrollmentNo, dateOfBirth: st.dateOfBirth, gender: st.gender, address: st.address, campus: st.campus?.name ?? null, department: st.department.name, programme: st.program?.name ?? null, branch: st.branch?.name ?? null, batch: st.batch.name, admissionYear: st.admissionYear, graduationYear: st.batch.endYear },
    profile: p && { personal: p.personal, academics: p.academics, career: p.career, submittedAt: p.submittedAt, declarationAcceptedAt: p.declarationAcceptedAt, reviewNote: p.reviewNote },
    nameReview: p?.proposedName && p.proposedName !== st.name ? { invited: st.name, entered: p.proposedName, decidedAt: p.nameDecidedAt } : null,
    education: st.educationRecords.map((e) => ({ ...e, percentage: e.percentage == null ? null : Number(e.percentage), cgpa: e.cgpa == null ? null : Number(e.cgpa) })),
    documents,
    missingDocuments: requiredDocuments(st.educationRecords).filter((c) => !have.has(c)),
    sections: st.sections.map((x) => ({ id: x.id, section: x.section, status: x.status, data: x.data, pendingData: x.pendingData, reviewComment: x.reviewComment, submittedAt: x.submittedAt })),
    corrections: st.correctionRequests,
  };
});
