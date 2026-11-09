import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { ApiError, badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { educationInput } from "@/lib/api/academic";
import { assertSectionOpen, semesterInput } from "@/lib/academicRecords";
import { assertEducationEditable } from "@/lib/invitations/guard";
import { markSuggestion } from "@/lib/documentAi";
import { reviseEducationRecord, upsertSemester } from "@/lib/studentAcademicWrites";
import type { Extraction, Suggestion } from "@/lib/ocrSuggestions";

type P = { docId: string };
const body = z.object({ extractionId: z.uuid(), key: z.string().min(3).max(200), decision: z.enum(["APPLY", "DISMISS"]) });
const n = (v: unknown) => (v == null ? null : Number(v));

/**
 * Accept or dismiss one suggestion from the latest reading of my document. Accepting goes through the same code as my own edit, so a verified
 * record is never overwritten: the change waits for staff, and nothing is ever marked verified here.
 */
export const POST = studentRoute<P>({ module: "ONBOARDING", limit: { name: "academic-write", max: 300, windowSec: 3600 } }, async (req, me, { docId }) => {
  const b = await parseBody(req, body);
  const latest = await db.documentExtraction.findFirst({ where: { documentId: docId, studentId: me.studentId, collegeId: me.collegeId }, orderBy: { createdAt: "desc" } });
  if (!latest || latest.id !== b.extractionId) throw new ApiError(409, "STALE", "This document has been read again since. Reload to see the latest suggestions");
  const s = ((latest.suggestions as Suggestion[]) ?? []).find((x) => x.key === b.key);
  if (!s) throw notFound("Suggestion not found");
  if (s.state !== "OPEN") throw new ApiError(409, "CONFLICT", "This suggestion has already been dealt with");
  if (b.decision === "DISMISS") return { suggestions: await markSuggestion(latest.id, s.key, "DISMISSED") };
  if (s.kind === "flag" || !s.target) throw badRequest("This is information only; there is nothing to apply");

  if ("recordId" in s.target) {
    const t = s.target;
    await assertEducationEditable(me.studentId);
    await db.$transaction(async (tx) => {
      const r = await tx.studentEducationRecord.findFirst({ where: { id: t.recordId, studentId: me.studentId } });
      if (!r) throw notFound("Qualification not found");
      // Build on what the student currently proposes (a pending change, if there is one), so an earlier edit is not lost.
      const cur = { level: r.level, qualification: r.qualification, specialisation: r.specialisation, institution: r.institution, boardOrUniversity: r.boardOrUniversity, rollNo: r.rollNo, admissionYear: r.admissionYear, completionYear: r.completionYear, percentage: n(r.percentage), cgpa: n(r.cgpa), maxMarks: r.maxMarks, obtainedMarks: r.obtainedMarks, backlogs: r.backlogs, status: r.status, isCurrent: r.isCurrent, ...((r.pendingData as object | null) ?? {}) };
      const parsed = educationInput.safeParse({ ...cur, [t.field]: t.value });
      if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "This value does not fit the qualification", parsed.error.issues);
      await reviseEducationRecord(tx, me, r.id, parsed.data, "ai_suggestion");
    });
  } else {
    const f = latest.fields as Extraction | null;
    if (!f || f.semesterNumber !== s.target.semesterNumber) throw badRequest("The reading no longer matches this semester");
    const parsed = semesterInput.safeParse({
      semesterNumber: f.semesterNumber, sgpa: f.sgpa, resultStatus: /fail/i.test(f.result ?? "") ? "FAIL" : "PASS",
      subjects: f.subjects.filter((x) => x.obtained != null && x.max != null).map((x) => ({ name: x.name, code: x.code, marksObtained: x.obtained, maxMarks: x.max, credits: x.credits, grade: x.grade })),
    });
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "These marks could not be used", parsed.error.issues);
    await db.$transaction(async (tx) => {
      await assertSectionOpen(tx, me.studentId, "ACADEMICS");
      await upsertSemester(tx, me, parsed.data, "ai_suggestion");
    });
  }
  await audit({ collegeId: me.collegeId, userId: null }, { action: "student.document.ai_apply", entity: "Student", entityId: me.studentId, after: { docId, key: s.key, suggested: s.suggested } });
  return { suggestions: await markSuggestion(latest.id, s.key, "APPLIED") };
});
