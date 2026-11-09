import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError, badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { resolveMapping } from "@/lib/academicMapping";
import { expiryFor, issueInvitation, sendInvitationEmail } from "@/lib/invitations/service";

const invite = z.object({
  name: z.string().trim().min(2).max(120),
  enrollmentNo: z.string().trim().min(1).max(50),
  email: z.email().transform((e) => e.toLowerCase()),
  campusId: z.uuid().nullable().optional(),
  departmentId: z.uuid(),
  programId: z.uuid().nullable().optional(),
  branchId: z.uuid().nullable().optional(),
  batchId: z.uuid(),
  admissionYear: z.number().int().min(1990).max(2100),
  graduationYear: z.number().int().min(1990).max(2100).nullable().optional(),
});

/** Invite one student. Creates the student record and a single-use invitation, then emails the link. The officer enters nothing personal. */
export const POST = route({ limit: { name: "invite-create", max: 200, windowSec: 3600 }, roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (req, s) => {
  const b = await parseBody(req, invite);

  const clash = await db.student.findFirst({
    where: { collegeId: s.collegeId, OR: [{ enrollmentNo: { equals: b.enrollmentNo, mode: "insensitive" } }, { email: b.email }] },
    select: { enrollmentNo: true, email: true, onboardingStatus: true },
  });
  if (clash) {
    const pending = ["INVITATION_PENDING", "INVITATION_SENT", "INVITATION_EXPIRED"].includes(clash.onboardingStatus);
    const what = clash.email === b.email ? "email" : "admission number";
    throw new ApiError(409, "CONFLICT", pending ? `An invitation for this ${what} already exists. Resend it from the student list instead` : `A student with this ${what} already exists`);
  }
  if (b.campusId && !(await db.campus.findFirst({ where: { id: b.campusId, collegeId: s.collegeId, isActive: true }, select: { id: true } }))) throw badRequest("Campus not found");

  const made = await db.$transaction(async (tx) => {
    const m = await resolveMapping(tx, s.collegeId, b);
    const batch = await tx.batch.findUniqueOrThrow({ where: { id: m.batchId }, select: { endYear: true } });
    const graduationYear = b.graduationYear ?? batch.endYear;
    if (graduationYear < b.admissionYear) throw badRequest("Graduation year cannot be before the admission year");

    const st = await tx.student.create({
      data: { collegeId: s.collegeId, enrollmentNo: b.enrollmentNo, name: b.name, email: b.email, ...m, campusId: b.campusId ?? null, admissionYear: b.admissionYear },
      select: { id: true },
    });
    await tx.studentProgression.create({ data: { collegeId: s.collegeId, studentId: st.id, semesterId: m.currentSemesterId, academicYearId: m.currentAcademicYearId, kind: "ENROLLED", createdById: s.userId } });
    const issued = await issueInvitation(tx, {
      collegeId: s.collegeId, studentId: st.id, email: b.email, admissionNumber: b.enrollmentNo, createdById: s.userId, expiresAt: await expiryFor(s.collegeId, tx),
      structure: { campusId: b.campusId ?? null, departmentId: m.departmentId, programId: m.programId, branchId: m.branchId, batchId: m.batchId, admissionYear: b.admissionYear, graduationYear },
    });
    await audit(s, { action: "student.invite", entity: "Student", entityId: st.id, after: { enrollmentNo: b.enrollmentNo, email: b.email, batchId: m.batchId, programId: m.programId } }, tx);
    return { studentId: st.id, ...issued };
  });

  const mail = await sendInvitationEmail(made.invitationId, made.token, "INVITE");
  return { studentId: made.studentId, invitationId: made.invitationId, emailSent: mail.ok, emailError: mail.error ?? null };
});
