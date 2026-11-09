import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody, parseQuery } from "@/lib/api/parse";
import { ApiError, badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { studentSelect } from "@/lib/students";
import { resolveMapping } from "@/lib/academicMapping";
import { educationInput } from "@/lib/api/academic";
import { expireStale } from "@/lib/invitations/service";
import { studentFilterQuery, studentWhere } from "@/lib/studentFilters";
import { completionFor } from "@/lib/profileCompletionLoad";

const listQuery = studentFilterQuery.extend({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.uuid().optional(),
});

const create = z.object({
  enrollmentNo: z.string().trim().min(1).max(50),
  name: z.string().trim().min(2).max(120),
  email: z.email().transform((e) => e.toLowerCase()),
  phone: z.string().trim().regex(/^\+?[\d\s-]{7,16}$/).optional(),
  dateOfBirth: z.coerce.date().max(new Date(), { message: "Date of birth cannot be in the future" }).nullable().optional(),
  gender: z.string().trim().max(30).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  departmentId: z.uuid(),
  batchId: z.uuid(),
  programId: z.uuid().nullable().optional(),
  branchId: z.uuid().nullable().optional(),
  semesterId: z.uuid().nullable().optional(),
  academicYearId: z.uuid().nullable().optional(),
  education: z.array(educationInput).max(12).default([]),
});

export const GET = route({ module: "ONBOARDING" }, async (req, s) => {
  const { limit, cursor, ...filters } = parseQuery(req, listQuery);
  await expireStale(s.collegeId);
  const [rows] = await Promise.all([
    db.student.findMany({
      where: studentWhere(s, filters),
      select: {
        ...studentSelect,
        stage: true, isPlaced: true, participationStatus: true, onboardingStatus: true, lastActivityAt: true, updatedAt: true,
        invitation: { select: { status: true, expiresAt: true, sentAt: true, acceptedAt: true, graduationYear: true } },
        department: { select: { name: true } },
        program: { select: { name: true, code: true } },
        batch: { select: { name: true, endYear: true } },
        currentSemester: { select: { name: true } },
        _count: { select: { documents: { where: { status: "PENDING", archivedAt: null } } } },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
  ]);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const done = await completionFor(s.collegeId, page.map((r) => r.id));
  const items = page.map(({ _count, ...r }) => ({
    ...r,
    // Same calculation the student sees (lib/profileCompletion): `completion` is the student's part, `verifiedPercent` the placement cell's.
    completion: done.get(r.id)?.percent ?? 0,
    verifiedPercent: done.get(r.id)?.verifiedPercent ?? 0,
    pendingDocs: _count.documents,
    graduationYear: r.batch.endYear,
  }));
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
});

export const POST = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (req, s) => {
  const { education, semesterId, academicYearId, ...data } = await parseBody(req, create);
  if (education.filter((e) => e.isCurrent).length > 1) throw badRequest("Only one qualification can be marked as current");
  if (await db.student.findFirst({ where: { collegeId: s.collegeId, OR: [{ enrollmentNo: data.enrollmentNo }, { email: data.email }] }, select: { id: true } }))
    throw new ApiError(409, "CONFLICT", "A student with this admission number or email already exists");

  return db.$transaction(async (tx) => {
    const m = await resolveMapping(tx, s.collegeId, { ...data, semesterId, academicYearId });
    const st = await tx.student.create({
      data: { ...data, ...m, collegeId: s.collegeId, dateOfBirth: data.dateOfBirth ?? null, gender: data.gender ?? null, address: data.address ?? null },
      select: studentSelect,
    });
    if (education.length) await tx.studentEducationRecord.createMany({ data: education.map((e) => ({ ...e, collegeId: s.collegeId, studentId: st.id })) });
    // The first progression row records where the student started; later moves add rows and never overwrite this one.
    await tx.studentProgression.create({ data: { collegeId: s.collegeId, studentId: st.id, semesterId: m.currentSemesterId, academicYearId: m.currentAcademicYearId, kind: "ENROLLED", createdById: s.userId } });
    await audit(s, { action: "student.create", entity: "Student", entityId: st.id, after: { enrollmentNo: st.enrollmentNo, email: st.email, batchId: m.batchId, programId: m.programId, education: education.length } }, tx);
    return st;
  });
});
