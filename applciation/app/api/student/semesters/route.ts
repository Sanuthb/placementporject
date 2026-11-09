import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { upsertSemester } from "@/lib/studentAcademicWrites";
import { assertSectionOpen, semesterInput, semesterView, type SemRow } from "@/lib/academicRecords";

/** My semester results, with subject marks. The percentage is worked out from the marks, never stored. */
export const GET = studentRoute({ module: "ONBOARDING" }, async (_req, me) => {
  const rows = await db.semesterResult.findMany({ where: { studentId: me.studentId }, include: { subjects: true }, orderBy: { semesterNumber: "asc" } });
  return rows.map((r) => semesterView(r as unknown as SemRow & { id: string }));
});

/**
 * Add or change one semester (identified by its number). A semester staff have verified is never overwritten in place: the change waits
 * as a pending revision until the ACADEMICS section is resubmitted and approved.
 */
export const PUT = studentRoute({ module: "ONBOARDING", limit: { name: "academic-write", max: 300, windowSec: 3600 } }, async (req, me) => {
  const b = await parseBody(req, semesterInput);
  return db.$transaction(async (tx) => {
    await assertSectionOpen(tx, me.studentId, "ACADEMICS");
    return upsertSemester(tx, me, b);
  });
});
