import { after } from "next/server";
import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { approveSection, scopedStudent } from "@/lib/verification";
import { syncOnboardingStatus } from "@/lib/invitations/status";
import { refreshIfTracked } from "@/lib/intelligence/service";
import { tellStudent } from "@/lib/invitations/notify";

const body = z.object({ comment: z.string().trim().max(500).optional(), nameDecision: z.enum(["keep", "accept"]).optional() });

/**
 * Verifies the whole profile: approves every section under review. It refuses while a document is still waiting or rejected,
 * and while the student entered a different name that nobody has decided on. Either all of it happens or none of it.
 */
export const POST = route<{ id: string }>({ module: "ONBOARDING" }, async (req, s, { id }) => {
  await scopedStudent(s, id);
  const b = await parseBody(req, body);
  await db.$transaction(async (tx) => {
    const st = await tx.student.findUniqueOrThrow({ where: { id }, select: { name: true, onboardingStatus: true, onboardingProfile: { select: { proposedName: true, nameDecidedAt: true } } } });
    if (!["SUBMITTED", "VERIFICATION_IN_PROGRESS"].includes(st.onboardingStatus)) throw new ApiError(409, "CONFLICT", "Only a submitted profile can be verified");

    const proposed = st.onboardingProfile?.proposedName;
    if (proposed && proposed !== st.name && !st.onboardingProfile?.nameDecidedAt) {
      if (!b.nameDecision) throw new ApiError(409, "NAME_REVIEW_REQUIRED", `The student entered the name "${proposed}" but was invited as "${st.name}". Choose which to keep`);
      if (b.nameDecision === "accept") await tx.student.update({ where: { id }, data: { name: proposed } });
      await tx.studentOnboardingProfile.update({ where: { studentId: id }, data: { nameDecidedAt: new Date() } });
      await audit(s, { action: "student.name.review", entity: "Student", entityId: id, before: { name: st.name }, after: { decision: b.nameDecision, name: b.nameDecision === "accept" ? proposed : st.name } }, tx);
    }

    const open = await tx.studentDocument.count({ where: { studentId: id, status: { in: ["PENDING", "REJECTED"] } } });
    if (open) throw new ApiError(409, "DOCUMENTS_OPEN", `${open} document${open > 1 ? "s are" : " is"} still waiting for review or rejected. Verify or resolve them first`);

    const sections = await tx.studentSection.findMany({ where: { studentId: id, status: "SUBMITTED" }, select: { id: true } });
    for (const sec of sections) await approveSection(tx, s, sec.id, b.comment);

    await syncOnboardingStatus(tx, id);
    const after = await tx.student.findUniqueOrThrow({ where: { id }, select: { onboardingStatus: true } });
    if (after.onboardingStatus !== "VERIFIED") throw new ApiError(409, "SECTIONS_MISSING", "Not every required section has been submitted and approved yet");
    await tx.studentOnboardingProfile.update({ where: { studentId: id }, data: { reviewNote: null } });
    await audit(s, { action: "student.verification.verify", entity: "Student", entityId: id, after: { sections: sections.length }, reason: b.comment }, tx);
  });
  // If an AI reading already exists, bring it up to date now that the marks are verified.
  after(() => refreshIfTracked(s.collegeId, id));
  await tellStudent(s.collegeId, id, { type: "onboarding.verified", title: "Your profile has been verified", body: b.comment });
  return { status: "VERIFIED" };
});
