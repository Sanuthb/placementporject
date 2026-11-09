import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { ProfileSection } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { scopedStudent } from "@/lib/verification";
import { tellStudent } from "@/lib/invitations/notify";

const body = z.object({ comment: z.string().trim().min(3).max(1000), sections: z.array(z.enum(ProfileSection)).max(8).optional() });

/** Sends the profile back to the student with a comment. The sections named (default: all under review) are reopened for editing. */
export const POST = route<{ id: string }>({ module: "ONBOARDING" }, async (req, s, { id }) => {
  await scopedStudent(s, id);
  const b = await parseBody(req, body);
  await db.$transaction(async (tx) => {
    const st = await tx.student.findUniqueOrThrow({ where: { id }, select: { onboardingStatus: true } });
    if (!["SUBMITTED", "VERIFICATION_IN_PROGRESS", "REJECTED"].includes(st.onboardingStatus)) throw new ApiError(409, "CONFLICT", "Corrections can only be requested on a submitted profile");
    const rows = await tx.studentSection.findMany({ where: { studentId: id, status: "SUBMITTED", ...(b.sections ? { section: { in: b.sections } } : {}) }, select: { id: true, section: true } });
    if (rows.length) {
      await tx.studentSection.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { status: "CHANGES_REQUESTED", reviewComment: b.comment, reviewedAt: new Date() } });
      await tx.verificationEvent.createMany({ data: rows.map((r) => ({ collegeId: s.collegeId, studentId: id, section: r.section, action: "CHANGES_REQUESTED" as const, actorId: s.userId, comment: b.comment })) });
    }
    await tx.studentOnboardingProfile.update({ where: { studentId: id }, data: { reviewNote: b.comment } });
    await tx.student.update({ where: { id }, data: { onboardingStatus: "CHANGES_REQUESTED" } });
    await audit(s, { action: "student.verification.changes", entity: "Student", entityId: id, before: { status: st.onboardingStatus }, after: { sections: rows.map((r) => r.section) }, reason: b.comment }, tx);
  });
  await tellStudent(s.collegeId, id, { type: "onboarding.changes", title: "Changes were requested on your profile", body: b.comment });
  return { status: "CHANGES_REQUESTED" };
});
