import { z } from "zod";

/**
 * What the AI is asked to read from a marksheet or certificate. Kept flat and nullable (no range constraints) so it maps cleanly onto structured
 * output; ranges and plausibility are checked afterwards in `cleanExtraction`, never trusted from the model.
 */
export const extractionSchema = z.object({
  documentKind: z.enum(["TENTH_MARKSHEET", "TWELFTH_MARKSHEET", "DIPLOMA_MARKSHEET", "DEGREE_SEMESTER_MARKSHEET", "DEGREE_CERTIFICATE", "OTHER", "UNREADABLE"]),
  candidateName: z.string().nullable(),
  boardOrUniversity: z.string().nullable(),
  institution: z.string().nullable(),
  examYear: z.number().nullable(),
  semesterNumber: z.number().nullable(),
  totalObtained: z.number().nullable(),
  totalMax: z.number().nullable(),
  percentage: z.number().nullable(),
  sgpa: z.number().nullable(),
  cgpa: z.number().nullable(),
  result: z.string().nullable(),
  subjects: z.array(z.object({ name: z.string(), code: z.string().nullable(), obtained: z.number().nullable(), max: z.number().nullable(), grade: z.string().nullable(), credits: z.number().nullable() })),
  confidence: z.enum(["high", "medium", "low"]),
  notes: z.string().nullable(),
});
export type Extraction = z.infer<typeof extractionSchema>;

const inRange = (v: number | null, lo: number, hi: number) => (v != null && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
const str = (v: string | null, max: number) => (v && v.trim() ? v.trim().slice(0, max) : null);

/** Drops anything implausible, so a misread can never become a suggestion that the records would refuse anyway. */
export function cleanExtraction(x: Extraction): Extraction {
  const year = new Date().getFullYear();
  const totalMax = inRange(x.totalMax, 1, 100000);
  const totalObtained = totalMax != null ? inRange(x.totalObtained, 0, totalMax) : null;
  return {
    ...x,
    candidateName: str(x.candidateName, 120), boardOrUniversity: str(x.boardOrUniversity, 160), institution: str(x.institution, 160),
    examYear: inRange(x.examYear, 1950, year + 1), semesterNumber: inRange(x.semesterNumber, 1, 12),
    totalObtained, totalMax: totalObtained != null ? totalMax : null,
    percentage: inRange(x.percentage, 0, 100), sgpa: inRange(x.sgpa, 0, 10), cgpa: inRange(x.cgpa, 0, 10),
    result: str(x.result, 40), notes: str(x.notes, 500),
    subjects: x.subjects.slice(0, 25).filter((s) => s.name.trim()).map((s) => {
      const max = inRange(s.max, 1, 1000);
      return { name: s.name.trim().slice(0, 120), code: str(s.code, 30), obtained: max != null ? inRange(s.obtained, 0, max) : null, max, grade: str(s.grade, 5), credits: inRange(s.credits, 0, 30) };
    }),
  };
}

export type SuggestionState = "OPEN" | "APPLIED" | "DISMISSED";
/** `education` and `semester` suggestions can be applied by the student (into their draft). `flag` is information for the student and staff. */
export type Suggestion = {
  key: string; kind: "education" | "semester" | "flag"; label: string; current: string | null; suggested: string; state: SuggestionState;
  target?: { recordId: string; field: "percentage" | "obtainedMarks" | "maxMarks" | "completionYear" | "boardOrUniversity"; value: number | string } | { semesterNumber: number };
};

export type EduRecord = { id: string; level: string; qualification: string; percentage: number | null; obtainedMarks: number | null; maxMarks: number | null; completionYear: number | null; boardOrUniversity: string | null };
export type SemRecord = { semesterNumber: number; sgpa: number | null; subjects: number };
export type Context = { category: string; studentName: string; education: EduRecord[]; semesters: SemRecord[]; is10: (e: EduRecord) => boolean; is12: (e: EduRecord) => boolean; isDiploma: (e: EduRecord) => boolean };

const KIND_FOR: Record<string, Extraction["documentKind"][]> = {
  TENTH_MARKS: ["TENTH_MARKSHEET"], TWELFTH_MARKS: ["TWELFTH_MARKSHEET"], DIPLOMA_CERTIFICATE: ["DIPLOMA_MARKSHEET"],
  DEGREE_MARKS: ["DEGREE_SEMESTER_MARKSHEET"], DEGREE_CERTIFICATE: ["DEGREE_CERTIFICATE"], PROVISIONAL_CERTIFICATE: ["DEGREE_CERTIFICATE"],
};
const KIND_LABEL: Record<string, string> = { TENTH_MARKSHEET: "a 10th marksheet", TWELFTH_MARKSHEET: "a 12th marksheet", DIPLOMA_MARKSHEET: "a diploma marksheet", DEGREE_SEMESTER_MARKSHEET: "a degree semester marksheet", DEGREE_CERTIFICATE: "a degree certificate", OTHER: "something else" };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
/** Names on marksheets are often initials-first or reordered ("B SANUTH BIBIN"). Same letters in any word order, or every word of one found in the other, counts as a match. */
export function namesMatch(a: string, b: string) {
  const wa = a.toLowerCase().split(/[^a-z]+/).filter(Boolean), wb = b.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  if (norm([...wa].sort().join("")) === norm([...wb].sort().join(""))) return true;
  const long = (w: string[]) => w.filter((x) => x.length > 1);
  const [x, y] = long(wa).length <= long(wb).length ? [long(wa), wb] : [long(wb), wa];
  return x.length > 0 && x.every((w) => y.includes(w));
}
const round2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (v: number | string | null) => (v == null ? null : String(v));

/** Turns one reading into suggestions and flags. Pure: the caller loads the records and stores the result. */
export function buildSuggestions(x: Extraction, ctx: Context): Suggestion[] {
  const out: Suggestion[] = [];
  const flag = (key: string, label: string, suggested: string) => out.push({ key: `flag:${key}`, kind: "flag", label, current: null, suggested, state: "OPEN" });

  if (x.documentKind === "UNREADABLE") { flag("unreadable", "Could not read this document", "Upload a clearer scan or photo (flat, well lit, all corners visible)."); return out; }
  const expected = KIND_FOR[ctx.category];
  if (expected && !expected.includes(x.documentKind)) flag("kind", "Document type does not match", `Uploaded as ${ctx.category.toLowerCase().replace(/_/g, " ")}, but it looks like ${KIND_LABEL[x.documentKind] ?? "something else"}.`);
  if (x.candidateName && !namesMatch(x.candidateName, ctx.studentName)) flag("name", "Name on the document differs", `The document says "${x.candidateName}"; the profile says "${ctx.studentName}".`);
  if (x.confidence === "low") flag("confidence", "Low confidence reading", "Parts of the document were hard to read. Check every suggested value against the document.");

  const pct = x.percentage ?? (x.totalObtained != null && x.totalMax ? round2((x.totalObtained / x.totalMax) * 100) : null);
  const pick = x.documentKind === "TENTH_MARKSHEET" ? ctx.is10 : x.documentKind === "TWELFTH_MARKSHEET" ? ctx.is12 : x.documentKind === "DIPLOMA_MARKSHEET" ? ctx.isDiploma : null;
  if (pick) {
    const rec = ctx.education.find(pick);
    if (!rec) flag("no-record", "No matching qualification", "Add this qualification under Education first; then the values read from this document can be filled in.");
    else {
      const edu = (field: NonNullable<Extract<Suggestion["target"], { recordId: string }>>["field"], label: string, current: number | string | null, value: number | string | null, same: boolean) => {
        if (value == null || same) return;
        out.push({ key: `education:${rec.id}:${field}`, kind: "education", label: `${rec.qualification}: ${label}`, current: fmt(current), suggested: String(value), state: "OPEN", target: { recordId: rec.id, field, value } });
      };
      edu("percentage", "percentage", rec.percentage, pct, rec.percentage != null && pct != null && Math.abs(rec.percentage - pct) < 0.01);
      const obt = x.totalObtained != null ? Math.round(x.totalObtained) : null, max = x.totalMax != null ? Math.round(x.totalMax) : null;
      edu("obtainedMarks", "marks obtained", rec.obtainedMarks, obt, rec.obtainedMarks === obt);
      edu("maxMarks", "maximum marks", rec.maxMarks, max, rec.maxMarks === max);
      edu("completionYear", "year passed", rec.completionYear, x.examYear, rec.completionYear === x.examYear);
      edu("boardOrUniversity", "board", rec.boardOrUniversity, x.boardOrUniversity, !!rec.boardOrUniversity && !!x.boardOrUniversity && norm(rec.boardOrUniversity) === norm(x.boardOrUniversity));
    }
  }

  if (x.documentKind === "DEGREE_SEMESTER_MARKSHEET") {
    const usable = x.subjects.filter((s) => s.obtained != null && s.max != null);
    if (x.semesterNumber == null) flag("semester", "Semester number not found", "The semester could not be read from this marksheet, so it cannot fill in a semester result.");
    else if (usable.length || x.sgpa != null) {
      const have = ctx.semesters.find((s) => s.semesterNumber === x.semesterNumber);
      const sameSgpa = have && have.sgpa != null && x.sgpa != null && Math.abs(have.sgpa - x.sgpa) < 0.01;
      if (!have || !sameSgpa || have.subjects !== usable.length) {
        out.push({
          key: `semester:${x.semesterNumber}`, kind: "semester", label: `Semester ${x.semesterNumber}`,
          current: have ? `SGPA ${have.sgpa ?? "not entered"}, ${have.subjects} subject${have.subjects === 1 ? "" : "s"}` : null,
          suggested: `SGPA ${x.sgpa ?? "not shown"}, ${usable.length} subject${usable.length === 1 ? "" : "s"} with marks`, state: "OPEN", target: { semesterNumber: x.semesterNumber },
        });
      }
    }
  }
  return out;
}
