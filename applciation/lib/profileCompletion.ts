/**
 * The one place that decides how complete a student profile is and what the student should do next. Pure (no database), so the student
 * dashboard, the profile page, the staff list and summary, readiness and Student 360 all agree, and it can be unit-tested.
 *
 * What counts: every required section (college setting, or the default list) and every marksheet the student's own education history calls
 * for. Two numbers come out:
 *  - `percent`: the student's part. An item counts once it is submitted or verified.
 *  - `verifiedPercent`: the placement cell's part. An item counts once it is verified.
 */

export type ItemState = "done" | "waiting" | "todo" | "fix";
export type CompletionItem = { key: string; kind: "section" | "document"; label: string; state: ItemState; detail?: string; href: string };
export type NextAction = { kind: "fix" | "onboarding" | "todo" | "wait" | "optional" | "none"; title: string; detail: string; href: string | null };
export type Completion = { percent: number; verifiedPercent: number; total: number; done: number; waiting: number; items: CompletionItem[]; missing: CompletionItem[]; nextAction: NextAction };

export type CompletionInput = {
  required: string[];
  sections: { section: string; status: string; reviewComment?: string | null; hasData?: boolean }[];
  /** Live (not archived) documents only. */
  documents: { category: string; status: string; fileName: string; rejectReason?: string | null }[];
  requiredDocuments: string[];
  onboardingStatus: string;
  /** Sections a student may add but does not have to, offered once everything required is done. */
  optional?: string[];
};

export const SECTION_LABEL: Record<string, string> = {
  PERSONAL: "Personal details", ACADEMICS: "Academics", EDUCATION_HISTORY: "Education history", SKILLS: "Skills", PROJECTS: "Projects",
  INTERNSHIPS: "Internships", RESUME: "Resume", DOCUMENTS: "Supporting documents", ACHIEVEMENTS: "Achievements",
};
export const DOCUMENT_LABEL: Record<string, string> = {
  TENTH_MARKS: "SSLC / 10th marks card", TWELFTH_MARKS: "PUC / 12th marks card", DIPLOMA_CERTIFICATE: "Diploma certificate", DEGREE_MARKS: "Degree semester marks cards",
  DEGREE_CERTIFICATE: "Degree certificate", PROVISIONAL_CERTIFICATE: "Provisional certificate", OTHER: "Other document",
};
/** Before the student has submitted the onboarding wizard, the wizard is where everything is filled in. */
const PRE_SUBMIT = ["INVITATION_PENDING", "INVITATION_SENT", "INVITATION_ACCEPTED", "PROFILE_IN_PROGRESS"];
const ONBOARDING = "/student/onboarding";

function sectionItem(name: string, row: CompletionInput["sections"][number] | undefined): CompletionItem {
  const label = SECTION_LABEL[name] ?? name;
  const href = `/student/profile/${name}`;
  const st = row?.status ?? "DRAFT";
  if (st === "VERIFIED") return { key: `section:${name}`, kind: "section", label, state: "done", href };
  if (st === "SUBMITTED") return { key: `section:${name}`, kind: "section", label, state: "waiting", detail: "Waiting for the placement cell", href };
  if (st === "CHANGES_REQUESTED") return { key: `section:${name}`, kind: "section", label, state: "fix", detail: row?.reviewComment || "The placement cell asked for changes", href };
  return { key: `section:${name}`, kind: "section", label, state: "todo", detail: row?.hasData ? "Saved as a draft, not submitted yet" : "Not filled in yet", href };
}

function documentItem(category: string, docs: CompletionInput["documents"]): CompletionItem {
  const label = DOCUMENT_LABEL[category] ?? category;
  const mine = docs.filter((d) => d.category === category);
  const base = { key: `document:${category}`, kind: "document" as const, label, href: ONBOARDING };
  if (mine.some((d) => d.status === "VERIFIED")) return { ...base, state: "done" };
  if (mine.some((d) => d.status === "PENDING")) return { ...base, state: "waiting", detail: "Uploaded, waiting for the placement cell" };
  const rejected = mine.find((d) => d.status === "REJECTED");
  if (rejected) return { ...base, state: "fix", detail: `"${rejected.fileName}" was rejected${rejected.rejectReason ? `: ${rejected.rejectReason}` : ""}. Upload a new copy` };
  return { ...base, state: "todo", detail: "Not uploaded yet" };
}

export function computeCompletion(input: CompletionInput): Completion {
  const items: CompletionItem[] = [
    ...[...new Set(input.required)].map((s) => sectionItem(s, input.sections.find((x) => x.section === s))),
    ...[...new Set(input.requiredDocuments)].map((c) => documentItem(c, input.documents)),
  ];
  // A rejected copy that is still live blocks verification (lib/invitations/status counts it as open), even when the category is otherwise
  // covered by a newer upload or is not required at all. The student has to replace or remove it, so it is a fix of its own.
  for (const d of input.documents.filter((x) => x.status === "REJECTED")) {
    const coveredByItem = items.some((i) => i.key === `document:${d.category}` && i.state === "fix");
    if (!coveredByItem) items.push({ key: `document:rejected:${d.category}:${d.fileName}`, kind: "document", label: DOCUMENT_LABEL[d.category] ?? d.category, state: "fix", detail: `"${d.fileName}" was rejected${d.rejectReason ? `: ${d.rejectReason}` : ""}. Remove it, or replace it with a new copy`, href: ONBOARDING });
  }
  const counted = items.filter((i) => !i.key.startsWith("document:rejected:"));
  const total = counted.length;
  const done = counted.filter((i) => i.state === "done").length;
  const waiting = counted.filter((i) => i.state === "waiting").length;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 100);
  const missing = items.filter((i) => i.state === "todo" || i.state === "fix");
  return { percent: pct(done + waiting), verifiedPercent: pct(done), total, done, waiting, items, missing, nextAction: nextAction(input, items) };
}

/** Exactly one recommendation, most urgent first: fix what staff sent back, finish onboarding, fill gaps, then wait, then optional extras. */
function nextAction(input: CompletionInput, items: CompletionItem[]): NextAction {
  const fix = items.find((i) => i.state === "fix");
  if (fix) return { kind: "fix", title: fix.kind === "section" ? `Fix ${fix.label.toLowerCase()}` : `Replace your ${fix.label.toLowerCase()}`, detail: fix.detail ?? "", href: fix.href };
  if (input.onboardingStatus === "CHANGES_REQUESTED") return { kind: "fix", title: "Make the changes the placement cell asked for", detail: "Open your onboarding form to see what needs changing, then submit it again.", href: ONBOARDING };
  if (PRE_SUBMIT.includes(input.onboardingStatus)) {
    const left = items.filter((i) => i.state === "todo").length;
    return { kind: "onboarding", title: "Finish your onboarding form", detail: left ? `${left} required item${left > 1 ? "s" : ""} still to fill in. Your progress is saved as you go.` : "Everything is filled in. Review it and submit.", href: ONBOARDING };
  }
  const todo = items.find((i) => i.state === "todo");
  if (todo) return { kind: "todo", title: todo.kind === "section" ? `Fill in and submit ${todo.label.toLowerCase()}` : `Upload your ${todo.label.toLowerCase()}`, detail: todo.detail ?? "", href: todo.href };
  const waiting = items.filter((i) => i.state === "waiting").length;
  if (waiting) return { kind: "wait", title: "Wait for the placement cell", detail: `${waiting} item${waiting > 1 ? "s are" : " is"} with the placement cell for review. You will get a notification when they are checked.`, href: null };
  const extra = (input.optional ?? []).find((s) => { const r = input.sections.find((x) => x.section === s); return !r || (r.status === "DRAFT" && !r.hasData); });
  if (extra) return { kind: "optional", title: `Add your ${(SECTION_LABEL[extra] ?? extra).toLowerCase()}`, detail: "Optional, but staff and recruiters see it once it is verified.", href: `/student/profile/${extra}` };
  return { kind: "none", title: "Your profile is complete", detail: "Everything required is verified.", href: null };
}
