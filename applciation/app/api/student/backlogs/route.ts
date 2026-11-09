import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertSectionOpen, backlogInput, backlogView, type BacklogRow } from "@/lib/academicRecords";

const MAX = 40;

/** My backlog subjects, each with every attempt. */
export const GET = studentRoute({ module: "ONBOARDING" }, async (_req, me) => {
  const rows = await db.backlog.findMany({ where: { studentId: me.studentId }, include: { attempts: true }, orderBy: [{ semesterNumber: "asc" }, { createdAt: "asc" }] });
  return rows.map((b) => backlogView(b as unknown as BacklogRow & { id: string }));
});

/** List a subject I failed. It starts with the failed attempt; later attempts (including the one that cleared it) are added, never replace it. */
export const POST = studentRoute({ module: "ONBOARDING", limit: { name: "academic-write", max: 300, windowSec: 3600 } }, async (req, me) => {
  const b = await parseBody(req, backlogInput);
  return db.$transaction(async (tx) => {
    await assertSectionOpen(tx, me.studentId, "ACADEMICS");
    if ((await tx.backlog.count({ where: { studentId: me.studentId } })) >= MAX) throw new ApiError(400, "BAD_REQUEST", `At most ${MAX} backlog subjects`);
    const dup = await tx.backlog.findFirst({ where: { studentId: me.studentId, semesterNumber: b.semesterNumber, subjectName: { equals: b.subjectName, mode: "insensitive" } } });
    if (dup) throw new ApiError(409, "CONFLICT", "This subject is already listed for that semester. Add a new attempt to it instead");
    const row = await tx.backlog.create({
      data: { collegeId: me.collegeId, studentId: me.studentId, subjectName: b.subjectName, subjectCode: b.subjectCode ?? null, semesterNumber: b.semesterNumber, attempts: { create: { collegeId: me.collegeId, attemptNumber: 1, examSession: b.examSession ?? null, marksObtained: b.marksObtained ?? null, outcome: "FAILED" } } },
      include: { attempts: true },
    });
    await audit({ collegeId: me.collegeId, userId: null }, { action: "student.backlog.add", entity: "Student", entityId: me.studentId, after: { subject: b.subjectName, semester: b.semesterNumber } }, tx);
    return backlogView(row as unknown as BacklogRow & { id: string });
  });
});
