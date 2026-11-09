import { ACHIEVEMENT_CATEGORIES, ACHIEVEMENT_LEVELS } from "@/lib/achievements"

export type SField = { name: string; label: string; type?: "text" | "number" | "date" | "url" | "textarea" | "select"; options?: readonly (readonly [string, string])[]; required?: boolean }
export type SectionConfig = {
  hint: string
  fields?: SField[]
  /** A repeating group stored as `{ [key]: [ {...}, {...} ] }`. */
  list?: { key: string; label: string; itemLabel: string; fields: SField[] }
  /** A comma-separated list stored as `{ [key]: ["a", "b"] }`. */
  tags?: { key: string; label: string }
  uploads?: boolean
  /** Structured records edited in their own panels on the page (semester results and backlogs, or qualifications). */
  records?: "academics" | "education"
}

/** What a student fills in for each profile section. The API accepts free-form data apart from academics, so the shape lives here. */
export const SECTIONS: Record<string, SectionConfig> = {
  PERSONAL: { hint: "Basic personal details.", fields: [{ name: "dob", label: "Date of birth", type: "date" }, { name: "gender", label: "Gender" }, { name: "phone", label: "Mobile number" }, { name: "alternateEmail", label: "Alternate email" }, { name: "address", label: "Address", type: "textarea" }, { name: "city", label: "City" }, { name: "state", label: "State" }, { name: "pincode", label: "Pincode" }, { name: "alternatePhone", label: "Alternate phone" }, { name: "linkedin", label: "LinkedIn address", type: "url" }] },
  ACADEMICS: { hint: "Your marks. Staff check these against your marksheets, so upload them under Documents.", fields: [{ name: "cgpa", label: "CGPA (out of 10)", type: "number" }, { name: "tenthPercentage", label: "10th percentage", type: "number" }, { name: "twelfthPercentage", label: "12th percentage", type: "number" }, { name: "activeBacklogs", label: "Active backlogs", type: "number" }], records: "academics" },
  EDUCATION_HISTORY: { hint: "Schools and colleges you have attended.", records: "education" },
  SKILLS: { hint: "Technical and soft skills.", tags: { key: "skills", label: "Skills (separate with commas)" } },
  PROJECTS: { hint: "Projects you built.", list: { key: "projects", label: "Projects", itemLabel: "project", fields: [{ name: "title", label: "Title" }, { name: "description", label: "What you built", type: "textarea" }, { name: "tools", label: "Tools used" }, { name: "link", label: "Link", type: "url" }] } },
  INTERNSHIPS: { hint: "Internships and training.", list: { key: "internships", label: "Internships", itemLabel: "internship", fields: [{ name: "company", label: "Company" }, { name: "role", label: "Role" }, { name: "duration", label: "Duration" }, { name: "description", label: "What you did", type: "textarea" }] } },
  RESUME: { hint: "A short summary for your resume.", fields: [{ name: "summary", label: "Professional summary (50+ characters)", type: "textarea" }, { name: "text", label: "Anything else for your resume", type: "textarea" }, { name: "url", label: "Link to your resume", type: "url" }] },
  DOCUMENTS: { hint: "Upload marksheets and ID proof.", uploads: true },
  ACHIEVEMENTS: { hint: "Awards, ranks, competitions, certifications and publications. Staff check each one, so upload a certificate or proof for it below.", uploads: true, list: { key: "achievements", label: "Achievements", itemLabel: "achievement", fields: [{ name: "title", label: "Title", required: true }, { name: "category", label: "Category", type: "select", options: ACHIEVEMENT_CATEGORIES, required: true }, { name: "level", label: "Level", type: "select", options: ACHIEVEMENT_LEVELS }, { name: "date", label: "Date", type: "date", required: true }, { name: "issuer", label: "Awarded by" }, { name: "position", label: "Position or rank (e.g. 1st, Winner)" }, { name: "description", label: "Details", type: "textarea" }, { name: "link", label: "Link (certificate or announcement)", type: "url" }] } },
}
