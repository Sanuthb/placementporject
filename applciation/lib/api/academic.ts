import { z } from "zod";

/** Shared validation for the academic structure (programmes, batches, semesters). Route files cannot export extras, so it lives here. */
export const programBase = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().toUpperCase().min(1).max(20),
  departmentId: z.uuid(),
  level: z.enum(["DIPLOMA", "UG", "PG", "DOCTORAL", "OTHER"]),
  qualification: z.string().trim().max(40).nullable().optional(),
  durationYears: z.number().int().min(1).max(8),
  semesterCount: z.number().int().min(1).max(16),
  /** Free-text name kept for existing data. Prefer universityId; when only a name is sent it is matched to a university record if one exists. */
  university: z.string().trim().max(120).nullable().optional(),
  universityId: z.uuid().nullable().optional(),
});

export const programCreate = programBase.extend({
  level: programBase.shape.level.default("PG"),
  durationYears: programBase.shape.durationYears.default(2),
  semesterCount: programBase.shape.semesterCount.default(4),
});

export const programPatch = programBase.partial().extend({ isActive: z.boolean().optional() });

export const BATCH_STATUS = ["UPCOMING", "ACTIVE", "COMPLETED", "ARCHIVED"] as const;
export const SESSION_STATUS = ["UPCOMING", "ACTIVE", "COMPLETED"] as const;

/** "MCA 2026-2028": the default batch name. It can be edited afterwards. */
export const batchName = (code: string, startYear: number, endYear: number) => `${code} ${startYear}–${endYear}`;

export const EDUCATION_STATUS = ["PURSUING", "COMPLETED", "DISCONTINUED"] as const;

/** One previous or current qualification. A student has several of these, one row each. */
export const educationInput = z
  .object({
    level: z.string().trim().min(2).max(40),
    qualification: z.string().trim().min(1).max(80),
    specialisation: z.string().trim().max(80).nullable().optional(),
    institution: z.string().trim().min(2).max(160),
    boardOrUniversity: z.string().trim().max(160).nullable().optional(),
    rollNo: z.string().trim().max(60).nullable().optional(),
    admissionYear: z.number().int().min(1950).max(2100).nullable().optional(),
    completionYear: z.number().int().min(1950).max(2100).nullable().optional(),
    percentage: z.number().min(0).max(100).nullable().optional(),
    cgpa: z.number().min(0).max(10).nullable().optional(),
    maxMarks: z.number().int().min(1).max(100000).nullable().optional(),
    obtainedMarks: z.number().int().min(0).max(100000).nullable().optional(),
    backlogs: z.number().int().min(0).max(100).default(0),
    status: z.enum(EDUCATION_STATUS).default("COMPLETED"),
    isCurrent: z.boolean().default(false),
  })
  .refine((v) => v.obtainedMarks == null || v.maxMarks == null || v.obtainedMarks <= v.maxMarks, { message: "Obtained marks cannot exceed maximum marks", path: ["obtainedMarks"] })
  .refine((v) => v.admissionYear == null || v.completionYear == null || v.completionYear >= v.admissionYear, { message: "Completion year cannot be before the admission year", path: ["completionYear"] });

export const universityBase = z.object({
  name: z.string().trim().min(2).max(200),
  code: z.string().trim().toUpperCase().min(1).max(20),
  website: z.url().max(300).nullable().optional(),
});
