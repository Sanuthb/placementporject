import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { badRequest } from "@/lib/api/errors";

type Tx = Prisma.TransactionClient | typeof db;

/** A branch must belong to the programme, and (through the programme's own college check) to the caller's college. */
export async function assertBranchOfProgram(tx: Tx, collegeId: string, branchId: string, programId: string | null | undefined) {
  if (!programId) throw badRequest("Choose a programme before a branch");
  const b = await tx.programmeBranch.findFirst({ where: { id: branchId, programId, collegeId }, select: { id: true } });
  if (!b) throw badRequest("That branch does not belong to the chosen programme");
}

/** A university must belong to the caller's college and be active. */
export async function assertUniversity(tx: Tx, collegeId: string, universityId: string) {
  const u = await tx.university.findFirst({ where: { id: universityId, collegeId, isActive: true }, select: { id: true, name: true } });
  if (!u) throw badRequest("University not found or inactive");
  return u;
}

/** A person given a role in this college (batch coordinator, mentor...) must be an active user of this college. */
export async function assertCollegeUser(tx: Tx, collegeId: string, userId: string, what: string) {
  const u = await tx.user.findFirst({ where: { id: userId, collegeId, isActive: true }, select: { id: true } });
  if (!u) throw badRequest(`${what} not found`);
}

export type Violation = { rule: string; entity: string; id: string; detail: string };

/**
 * Reads the whole academic structure of one college and reports every row whose references disagree with each other or point
 * outside the college. It changes nothing: existing data is reported, never rewritten. The API checks stop new bad rows;
 * this finds any that already exist (for example from before the checks, or written straight to the database).
 */
export async function findIntegrityViolations(collegeId: string): Promise<Violation[]> {
  const q = (rule: string, entity: string, sql: Prisma.Sql) =>
    db.$queryRaw<{ id: string; detail: string }[]>(sql).then((rows) => rows.map((r) => ({ rule, entity, id: r.id, detail: r.detail })));
  const c = collegeId;
  const parts = await Promise.all([
    q("program-department-college", "Program", Prisma.sql`SELECT p.id, 'Programme and department belong to different colleges' AS detail FROM "Program" p JOIN "Department" d ON d.id = p."departmentId" WHERE p."collegeId" = ${c}::uuid AND d."collegeId" <> p."collegeId"`),
    q("program-university-college", "Program", Prisma.sql`SELECT p.id, 'Programme and university belong to different colleges' AS detail FROM "Program" p JOIN "University" u ON u.id = p."universityId" WHERE p."collegeId" = ${c}::uuid AND u."collegeId" <> p."collegeId"`),
    q("branch-program-college", "ProgrammeBranch", Prisma.sql`SELECT b.id, 'Branch and programme belong to different colleges' AS detail FROM "ProgrammeBranch" b JOIN "Program" p ON p.id = b."programId" WHERE b."collegeId" = ${c}::uuid AND p."collegeId" <> b."collegeId"`),
    q("batch-program", "Batch", Prisma.sql`SELECT b.id, 'Batch programme belongs to another college' AS detail FROM "Batch" b JOIN "Program" p ON p.id = b."programId" WHERE b."collegeId" = ${c}::uuid AND p."collegeId" <> b."collegeId"`),
    q("batch-branch", "Batch", Prisma.sql`SELECT b.id, 'Batch branch is not a branch of the batch programme' AS detail FROM "Batch" b JOIN "ProgrammeBranch" br ON br.id = b."branchId" WHERE b."collegeId" = ${c}::uuid AND (br."programId" IS DISTINCT FROM b."programId" OR br."collegeId" <> b."collegeId")`),
    q("semester-batch", "Semester", Prisma.sql`SELECT s.id, 'Semester batch belongs to another college' AS detail FROM "Semester" s JOIN "Batch" b ON b.id = s."batchId" WHERE s."collegeId" = ${c}::uuid AND b."collegeId" <> s."collegeId"`),
    q("semester-year", "Semester", Prisma.sql`SELECT s.id, 'Semester academic year belongs to another college' AS detail FROM "Semester" s JOIN "AcademicYear" y ON y.id = s."academicYearId" WHERE s."collegeId" = ${c}::uuid AND y."collegeId" <> s."collegeId"`),
    q("student-structure-college", "Student", Prisma.sql`SELECT s.id, 'Student refers to structure of another college' AS detail FROM "Student" s
      LEFT JOIN "Department" d ON d.id = s."departmentId" LEFT JOIN "Program" p ON p.id = s."programId" LEFT JOIN "Batch" b ON b.id = s."batchId"
      LEFT JOIN "ProgrammeBranch" br ON br.id = s."branchId" LEFT JOIN "Semester" sm ON sm.id = s."currentSemesterId" LEFT JOIN "AcademicYear" y ON y.id = s."currentAcademicYearId"
      WHERE s."collegeId" = ${c}::uuid AND (d."collegeId" <> s."collegeId" OR p."collegeId" <> s."collegeId" OR b."collegeId" <> s."collegeId" OR br."collegeId" <> s."collegeId" OR sm."collegeId" <> s."collegeId" OR y."collegeId" <> s."collegeId")`),
    q("student-program-department", "Student", Prisma.sql`SELECT s.id, 'Student programme is offered by a different department' AS detail FROM "Student" s JOIN "Program" p ON p.id = s."programId" WHERE s."collegeId" = ${c}::uuid AND p."departmentId" IS NOT NULL AND p."departmentId" <> s."departmentId"`),
    q("student-batch-program", "Student", Prisma.sql`SELECT s.id, 'Student programme differs from the batch programme' AS detail FROM "Student" s JOIN "Batch" b ON b.id = s."batchId" WHERE s."collegeId" = ${c}::uuid AND b."programId" IS NOT NULL AND s."programId" IS NOT NULL AND s."programId" <> b."programId"`),
    q("student-semester-batch", "Student", Prisma.sql`SELECT s.id, 'Student semester does not belong to the student batch' AS detail FROM "Student" s JOIN "Semester" sm ON sm.id = s."currentSemesterId" WHERE s."collegeId" = ${c}::uuid AND sm."batchId" <> s."batchId"`),
    q("faculty-college", "FacultyProfile", Prisma.sql`SELECT f."userId" AS id, 'Faculty allocation crosses colleges' AS detail FROM "FacultyProfile" f WHERE f."collegeId" = ${c}::uuid AND (
      EXISTS (SELECT 1 FROM "FacultyDepartment" fd JOIN "Department" d ON d.id = fd."departmentId" WHERE fd."userId" = f."userId" AND d."collegeId" <> f."collegeId")
      OR EXISTS (SELECT 1 FROM "FacultyProgram" fp JOIN "Program" p ON p.id = fp."programId" WHERE fp."userId" = f."userId" AND p."collegeId" <> f."collegeId")
      OR EXISTS (SELECT 1 FROM "FacultyBatch" fb JOIN "Batch" b ON b.id = fb."batchId" WHERE fb."userId" = f."userId" AND b."collegeId" <> f."collegeId"))`),
  ]);
  return parts.flat();
}

/**
 * Works out the university link for a programme write. universityId wins; a bare name is matched to a university of the same college
 * (ignoring case) so old clients keep working; otherwise the legacy text is stored as given. Returns the two columns to write, or
 * undefined when the request did not touch the university at all.
 */
export async function resolveUniversity(tx: Tx, collegeId: string, input: { university?: string | null; universityId?: string | null }) {
  if (input.universityId === undefined && input.university === undefined) return undefined;
  if (input.universityId) {
    const u = await assertUniversity(tx, collegeId, input.universityId);
    return { universityId: u.id, university: u.name };
  }
  if (input.universityId === null || !input.university) return { universityId: null, university: null };
  const u = await tx.university.findFirst({ where: { collegeId, isActive: true, name: { equals: input.university.trim(), mode: "insensitive" } }, select: { id: true, name: true } });
  return u ? { universityId: u.id, university: u.name } : { universityId: null, university: input.university };
}
