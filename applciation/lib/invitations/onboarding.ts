import { z } from "zod";
import type { DocCategory, OnboardingStatus, Prisma, ProfileSection } from "@/generated/prisma/client";

/** Statuses in which the student may still change what they entered. */
export const EDITABLE: OnboardingStatus[] = ["INVITATION_ACCEPTED", "PROFILE_IN_PROGRESS", "CHANGES_REQUESTED"];
/** Statuses in which staff are looking at a submitted profile. */
export const IN_REVIEW: OnboardingStatus[] = ["SUBMITTED", "VERIFICATION_IN_PROGRESS"];

const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) => z.preprocess((v) => (v === "" ? undefined : v), text(max).optional());
const list = (max: number) => z.array(text(80).min(1)).max(max).default([]);

/** Step 2. All optional while a draft; `computeMissing` says what is still needed to submit. */
export const personalDraft = z.object({
  fullName: optText(120),
  dob: optText(10),
  gender: optText(30),
  mobile: optText(20),
  alternateEmail: z.preprocess((v) => (v === "" ? undefined : v), z.email().max(200).optional()),
  address: optText(500),
  city: optText(80),
  state: optText(80),
  pincode: optText(12),
  linkedin: optText(300),
});
export type Personal = z.infer<typeof personalDraft>;

/** Step 3, the part that is not a qualification row: how the student is doing in the programme they were admitted to. */
export const academicsDraft = z.object({
  cgpa: z.number().min(0).max(10).nullable().optional(),
  activeBacklogs: z.number().int().min(0).max(100).nullable().optional(),
});

/** Step 5. Everything optional unless the college says otherwise. */
export const careerDraft = z.object({
  summary: optText(1000),
  technicalSkills: list(40),
  programmingLanguages: list(30),
  careerInterests: list(20),
  preferredRoles: list(20),
  certifications: z.array(z.object({ name: text(120).min(1), issuer: optText(120), year: z.number().int().min(1990).max(2100).nullable().optional() })).max(20).default([]),
  projects: z.array(z.object({ title: text(120).min(1), description: optText(1000), tools: optText(200), link: optText(300) })).max(20).default([]),
  internships: z.array(z.object({ company: text(120).min(1), role: optText(120), duration: optText(60), description: optText(1000) })).max(20).default([]),
});
export type Career = z.infer<typeof careerDraft>;

export const STEPS = ["Assigned details", "Personal information", "Education", "Documents", "Skills and career", "Review and submit"] as const;

type Edu = { level: string; percentage: unknown; cgpa: unknown; obtainedMarks: number | null; maxMarks: number | null; backlogs: number; status: string; institution: string; boardOrUniversity: string | null; completionYear: number | null; qualification: string }
const num = (v: unknown) => (v == null ? null : Number(v));
// A qualification is recognised from its level (the wizard's choices are "School" and "Higher Secondary") or from what the student typed.
type Named = { level: string; qualification?: string }
const text10 = /\b(10|10th|x|sslc|ssc|matric|matriculation)\b/i, text12 = /\b(12|12th|xii|puc|hsc|plus\s*two|intermediate)\b/i
const is10 = (e: Named) => e.level === "School" || text10.test(e.level) || text10.test(e.qualification ?? "")
const is12 = (e: Named) => !is10(e) && (e.level === "Higher Secondary" || text12.test(e.level) || text12.test(e.qualification ?? ""))
const isDiploma = (e: Named) => /diploma/i.test(e.level) || /diploma/i.test(e.qualification ?? "")

/** A record's percentage, or worked out from marks. */
export function percentOf(e: Pick<Edu, "percentage" | "obtainedMarks" | "maxMarks">): number | null {
  const p = num(e.percentage);
  if (p != null) return p;
  return e.obtainedMarks != null && e.maxMarks ? Math.round((e.obtainedMarks / e.maxMarks) * 10000) / 100 : null;
}

/** The marksheets the student's own history calls for. */
export function requiredDocuments(edu: Named[]): DocCategory[] {
  const out = new Set<DocCategory>();
  for (const e of edu) {
    if (is10(e)) out.add("TENTH_MARKS");
    else if (is12(e)) out.add("TWELFTH_MARKS");
    else if (isDiploma(e)) out.add("DIPLOMA_CERTIFICATE");
  }
  return [...out];
}

export const DOC_LABEL: Record<DocCategory, string> = {
  TENTH_MARKS: "SSLC / 10th marks card", TWELFTH_MARKS: "PUC / 12th marks card", DIPLOMA_CERTIFICATE: "Diploma certificate",
  DEGREE_MARKS: "Degree semester marks cards", DEGREE_CERTIFICATE: "Degree certificate", PROVISIONAL_CERTIFICATE: "Provisional certificate", OTHER: "Other document",
};

/**
 * What the student still has to provide before they can submit. Returned to the wizard so it can point at each gap, and enforced again on submit.
 * `step` says which wizard step fixes it.
 */
export function computeMissing(a: { personal: Personal; academics: z.infer<typeof academicsDraft>; education: Edu[]; documents: { category: DocCategory; fileName?: string; status?: string }[]; declarationAccepted: boolean }) {
  const out: { step: number; field: string; message: string }[] = [];
  const need = (step: number, field: string, ok: unknown, message: string) => { if (!ok) out.push({ step, field, message }); };
  const p = a.personal;
  need(2, "fullName", p.fullName, "Full name");
  need(2, "dob", p.dob && !Number.isNaN(Date.parse(p.dob)) && Date.parse(p.dob) <= Date.now(), "A valid date of birth (not in the future)");
  need(2, "mobile", p.mobile && /^\+?[\d\s-]{7,16}$/.test(p.mobile), "A valid personal mobile number");
  need(2, "address", p.address, "Address");
  need(2, "city", p.city, "City");
  need(2, "state", p.state, "State");
  need(2, "pincode", p.pincode, "Postal code");
  need(3, "education", a.education.length > 0, "At least one previous qualification");
  const tenth = a.education.find(is10), twelfth = a.education.find(is12), diploma = a.education.find(isDiploma);
  need(3, "tenth", tenth && percentOf(tenth) != null, "10th / SSLC percentage");
  need(3, "twelfth", (twelfth && percentOf(twelfth) != null) || (diploma && percentOf(diploma) != null), "12th / PUC (or diploma) percentage");
  need(3, "cgpa", a.academics.cgpa != null, "Your current CGPA in this programme (enter 0 if no result yet)");
  need(3, "backlogs", a.academics.activeBacklogs != null, "Number of active backlogs (enter 0 if none)");
  const have = new Set(a.documents.filter((d) => d.status !== "REJECTED").map((d) => d.category));
  for (const c of requiredDocuments(a.education)) need(4, `doc:${c}`, have.has(c), `Upload: ${DOC_LABEL[c]}`);
  for (const d of a.documents.filter((x) => x.status === "REJECTED")) out.push({ step: 4, field: `rejected:${d.fileName}`, message: `Replace the rejected document "${d.fileName}"` });
  need(6, "declaration", a.declarationAccepted, "Accept the data declaration");
  return out;
}

/** The profile sections the verification system works with, built from what the student entered. */
export function buildSections(a: { personal: Personal; academics: z.infer<typeof academicsDraft>; career: Career; education: Edu[]; documents: { category: DocCategory; fileName: string }[] }): Partial<Record<ProfileSection, Prisma.InputJsonObject>> {
  const tenth = a.education.find(is10), twelfth = a.education.find(is12), diploma = a.education.find(isDiploma);
  const p = a.personal;
  return {
    PERSONAL: { fullName: p.fullName ?? "", dob: p.dob ?? "", gender: p.gender ?? "", phone: p.mobile ?? "", alternateEmail: p.alternateEmail ?? "", address: p.address ?? "", city: p.city ?? "", state: p.state ?? "", pincode: p.pincode ?? "", linkedin: p.linkedin ?? "" },
    ACADEMICS: {
      cgpa: a.academics.cgpa ?? 0,
      tenthPercentage: tenth ? percentOf(tenth) ?? 0 : 0,
      twelfthPercentage: twelfth ? percentOf(twelfth) ?? 0 : diploma ? percentOf(diploma) ?? 0 : 0,
      activeBacklogs: a.academics.activeBacklogs ?? 0,
      backlogHistory: a.education.filter((e) => e.backlogs > 0).map((e) => ({ level: e.level, institution: e.institution, backlogs: e.backlogs })),
    },
    EDUCATION_HISTORY: { history: a.education.map((e) => ({ level: e.level, qualification: e.qualification, institution: e.institution, board: e.boardOrUniversity ?? "", year: e.completionYear, percentage: percentOf(e), status: e.status })) },
    SKILLS: { skills: [...new Set([...a.career.technicalSkills, ...a.career.programmingLanguages])], programmingLanguages: a.career.programmingLanguages, certifications: a.career.certifications, careerInterests: a.career.careerInterests, preferredRoles: a.career.preferredRoles },
    PROJECTS: { projects: a.career.projects },
    INTERNSHIPS: { internships: a.career.internships },
    RESUME: { summary: a.career.summary ?? "" },
    DOCUMENTS: { documents: a.documents.map((d) => ({ category: d.category, fileName: d.fileName })) },
  };
}
