export type SField = { name: string; label: string; type?: "text" | "number" | "date" | "url" | "textarea" }
export type SectionConfig = {
  hint: string
  fields?: SField[]
  /** A repeating group stored as `{ [key]: [ {...}, {...} ] }`. */
  list?: { key: string; label: string; itemLabel: string; fields: SField[] }
  /** A comma-separated list stored as `{ [key]: ["a", "b"] }`. */
  tags?: { key: string; label: string }
  uploads?: boolean
}

/** What a student fills in for each profile section. The API accepts free-form data apart from academics, so the shape lives here. */
export const SECTIONS: Record<string, SectionConfig> = {
  PERSONAL: { hint: "Basic personal details.", fields: [{ name: "dob", label: "Date of birth", type: "date" }, { name: "gender", label: "Gender" }, { name: "address", label: "Address", type: "textarea" }, { name: "city", label: "City" }, { name: "state", label: "State" }, { name: "pincode", label: "Pincode" }, { name: "alternatePhone", label: "Alternate phone" }, { name: "linkedin", label: "LinkedIn address", type: "url" }] },
  ACADEMICS: { hint: "Your marks. Staff check these against your marksheets, so upload them under Documents.", fields: [{ name: "cgpa", label: "CGPA (out of 10)", type: "number" }, { name: "tenthPercentage", label: "10th percentage", type: "number" }, { name: "twelfthPercentage", label: "12th percentage", type: "number" }, { name: "activeBacklogs", label: "Active backlogs", type: "number" }], list: { key: "semesters", label: "Semester results", itemLabel: "semester", fields: [{ name: "semester", label: "Semester", type: "number" }, { name: "sgpa", label: "SGPA", type: "number" }] } },
  EDUCATION_HISTORY: { hint: "Schools and colleges you have attended.", list: { key: "history", label: "Education", itemLabel: "entry", fields: [{ name: "level", label: "Level (for example 10th, 12th, Diploma)" }, { name: "institution", label: "Institution" }, { name: "board", label: "Board or university" }, { name: "year", label: "Year of passing", type: "number" }, { name: "percentage", label: "Percentage", type: "number" }] } },
  SKILLS: { hint: "Technical and soft skills.", tags: { key: "skills", label: "Skills (separate with commas)" } },
  PROJECTS: { hint: "Projects you built.", list: { key: "projects", label: "Projects", itemLabel: "project", fields: [{ name: "title", label: "Title" }, { name: "description", label: "What you built", type: "textarea" }, { name: "tools", label: "Tools used" }, { name: "link", label: "Link", type: "url" }] } },
  INTERNSHIPS: { hint: "Internships and training.", list: { key: "internships", label: "Internships", itemLabel: "internship", fields: [{ name: "company", label: "Company" }, { name: "role", label: "Role" }, { name: "duration", label: "Duration" }, { name: "description", label: "What you did", type: "textarea" }] } },
  RESUME: { hint: "A short summary for your resume.", fields: [{ name: "summary", label: "Professional summary (50+ characters)", type: "textarea" }, { name: "text", label: "Anything else for your resume", type: "textarea" }, { name: "url", label: "Link to your resume", type: "url" }] },
  DOCUMENTS: { hint: "Upload marksheets and ID proof.", uploads: true },
}
