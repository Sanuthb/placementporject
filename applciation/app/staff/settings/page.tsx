"use client"

import * as React from "react"
import { BuildingIcon, CalendarRangeIcon, ClipboardCheckIcon, GitBranchIcon, GraduationCapIcon, HandshakeIcon, LayersIcon, ListOrderedIcon, MailIcon, MapPinIcon, ShieldCheckIcon, UsersIcon, UsersRoundIcon, type LucideIcon } from "lucide-react"
import { toast } from "sonner"

import { ActiveBadge, MasterTab } from "@/components/master-tab"
import { StaffPanel } from "@/components/staff-panel"
import { SecuritySettings } from "@/components/security-settings"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { OptionSelect } from "@/components/option-select"
import { Badge } from "@/components/ui/badge"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, titleCase } from "@/lib/web/format"
import { useLookups } from "@/lib/web/lookups"
import { useApi } from "@/lib/web/use-api"

type Dept = { id: string; name: string; code: string; isActive: boolean }
type Program = { id: string; name: string; code: string; isActive: boolean; level: string; qualification: string | null; durationYears: number; semesterCount: number; university: string | null; department: { name: string } | null; branches?: { id: string; name: string }[] }
type Branch = { id: string; name: string; programId: string; isActive: boolean }
type Batch = { id: string; name: string; startYear: number; endYear: number; admissionYear: number | null; status: string; isActive: boolean; program: { name: string } | null; branch: { name: string } | null; coordinator: { name: string } | null; _count: { students: number; semesters: number } }
type Semester = { id: string; number: number; name: string; status: string; startDate: string | null; endDate: string | null; academicYearId: string | null; academicYear: { name: string } | null; _count: { studentsNow: number } }
type Year = { id: string; name: string; startDate: string; endDate: string; isCurrent: boolean; status: string }
type Staff = { id: string; name: string; email: string; role: string; departmentId: string | null; isActive: boolean }

const ROLES = ["TPO_ADMIN", "PLACEMENT_OFFICER", "DEPARTMENT_COORDINATOR"].map((v) => ({ value: v, label: titleCase(v) }))
const SECTIONS = [
  ["PERSONAL", "Personal details"], ["ACADEMICS", "Academics"], ["EDUCATION_HISTORY", "Education history"], ["SKILLS", "Skills"],
  ["PROJECTS", "Projects"], ["INTERNSHIPS", "Internships"], ["RESUME", "Resume"], ["DOCUMENTS", "Supporting documents"],
] as const
const APPROVALS = [
  ["OFFER_CREATE", "Creating offers", "An admin approves each offer before the student sees it."],
  ["BULK_EMAIL", "Bulk emails", "Emails to many students wait for approval before sending."],
  ["BULK_STATUS_CHANGE", "Bulk status changes", "Changing many students' status at once needs sign-off."],
  ["ELIGIBILITY_EXCEPTION", "Eligibility exceptions", "Letting a student into a drive they don't qualify for needs sign-off."],
] as const

type TabKey = "college" | "departments" | "programs" | "branches" | "batches" | "semesters" | "years" | "staff" | "verification" | "policies" | "campuses" | "invitations" | "security"
const GROUPS: { label: string; items: { key: TabKey; label: string; icon: LucideIcon; title: string; description: string }[] }[] = [
  { label: "Organisation", items: [
    { key: "college", label: "College profile", icon: BuildingIcon, title: "College profile", description: "The name, logo and brand colour used in reports and emails." },
    { key: "campuses", label: "Campuses", icon: MapPinIcon, title: "Campuses", description: "The campuses of your institution. Optional; students can be assigned to one when invited." },
    { key: "departments", label: "Departments", icon: LayersIcon, title: "Departments", description: "The branches students and coordinators belong to." },
    { key: "programs", label: "Programmes", icon: GraduationCapIcon, title: "Programmes", description: "Degrees a department offers, with their duration and number of semesters." },
    { key: "branches", label: "Branches", icon: GitBranchIcon, title: "Branches", description: "Specialisations inside a programme, such as Data Science under MCA." },
    { key: "years", label: "Academic years", icon: CalendarRangeIcon, title: "Academic years", description: "Teaching sessions. Mark which one is current so reports line up." },
    { key: "batches", label: "Batches", icon: UsersRoundIcon, title: "Batches", description: "One group of students admitted to a programme in the same year. Created once, for the whole programme." },
    { key: "semesters", label: "Semesters", icon: ListOrderedIcon, title: "Semesters", description: "The terms of a batch. Students move through them while staying in the same batch." },
  ] },
  { label: "People", items: [
    { key: "staff", label: "Staff", icon: UsersIcon, title: "Staff", description: "Invite colleagues, give them one or more roles, review sign-ins and reset access." },
    { key: "security", label: "Security", icon: ShieldCheckIcon, title: "Security", description: "Two-step sign-in for administrators." },
  ] },
  { label: "Rules", items: [
    { key: "invitations", label: "Student invitations", icon: MailIcon, title: "Student invitations", description: "How long an invitation stays valid, and the declaration students accept when they submit." },
    { key: "verification", label: "Verification", icon: ClipboardCheckIcon, title: "Verification rules", description: "What a student must complete before they count as verified." },
    { key: "policies", label: "Offers and approvals", icon: HandshakeIcon, title: "Offers and approvals", description: "Limits on offers and which actions need an admin's sign-off." },
  ] },
]
const ALL = GROUPS.flatMap((g) => g.items)

export default function SettingsPage() {
  // The open section lives in the address (#departments), so a refresh or a shared link lands on the same page.
  const hash = React.useSyncExternalStore(
    (cb) => { window.addEventListener("hashchange", cb); return () => window.removeEventListener("hashchange", cb) },
    () => window.location.hash.slice(1),
    () => "",
  )
  const tab: TabKey = ALL.find((i) => i.key === hash)?.key ?? "college"
  const go = (k: TabKey) => { window.history.pushState(null, "", `#${k}`); window.dispatchEvent(new HashChangeEvent("hashchange")) }
  const cur = ALL.find((i) => i.key === tab)!

  return (
    <div className="flex flex-col gap-6 md:flex-row md:gap-8">
      <nav aria-label="Settings sections" className="md:sticky md:top-4 md:w-56 md:shrink-0 md:self-start">
        <div className="flex gap-1 overflow-x-auto pb-2 md:flex-col md:gap-5 md:overflow-visible md:pb-0">
          {GROUPS.map((g) => (
            <div key={g.label} className="flex gap-1 md:flex-col">
              <span className="hidden px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground md:block">{g.label}</span>
              {g.items.map((i) => {
                const active = i.key === tab
                return (
                  <button key={i.key} type="button" onClick={() => go(i.key)} aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm transition-colors ${active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                    <i.icon className="size-4 shrink-0" />{i.label}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </nav>

      <section className="flex min-w-0 max-w-3xl flex-1 flex-col gap-5">
        <header className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">{cur.title}</h1>
          <p className="text-sm text-muted-foreground">{cur.description}</p>
        </header>
        <Panel tab={tab} />
      </section>
    </div>
  )
}

const LEVELS = [{ value: "DIPLOMA", label: "Diploma" }, { value: "UG", label: "Undergraduate" }, { value: "PG", label: "Postgraduate" }, { value: "DOCTORAL", label: "Doctoral" }, { value: "OTHER", label: "Other" }]
const BATCH_STATUS = ["UPCOMING", "ACTIVE", "COMPLETED", "ARCHIVED"].map((v) => ({ value: v, label: titleCase(v) }))
const SESSION_STATUS = ["UPCOMING", "ACTIVE", "COMPLETED"].map((v) => ({ value: v, label: titleCase(v) }))

const toProgramBody = (v: Record<string, string | boolean>) => ({
  ...(v.code ? { code: v.code } : {}), name: v.name, departmentId: v.departmentId, level: v.level || "PG",
  qualification: v.qualification || null, durationYears: Number(v.durationYears), semesterCount: Number(v.semesterCount), university: v.university || null,
})

function Panel({ tab }: { tab: TabKey }) {
  const lk = useLookups()
  const branches = useApi<Branch[]>("/api/settings/branches")
  const staff = useApi<Staff[]>("/api/settings/staff")
  const years = useApi<Year[]>("/api/settings/academic-years")
  const branchOptions = [{ value: "", label: "None" }, ...(branches.data ?? []).filter((b) => b.isActive).map((b) => ({ value: b.id, label: `${lk.programName[b.programId] ?? ""} - ${b.name}` }))]
  const staffOptions = [{ value: "", label: "None" }, ...(staff.data ?? []).filter((x) => x.isActive).map((x) => ({ value: x.id, label: x.name }))]
  const yearOptions = [{ value: "", label: "None" }, ...(years.data ?? []).map((y) => ({ value: y.id, label: y.name }))]
  switch (tab) {
    case "college": return <CollegeForm />
    case "verification": return <VerificationForm />
    case "policies": return <PoliciesForm />
    case "invitations": return <InvitationSettings />
    case "security": return <SecuritySettings />
    case "campuses": return (
      <MasterTab<Dept> endpoint="/api/settings/campuses" addLabel="Add campus" noun="campus" editable deletePath={(r) => `/api/settings/campuses/${r.id}`} patchPath={(r) => `/api/settings/campuses/${r.id}`}
        fields={[{ name: "name", label: "Name" }, { name: "code", label: "Short code (optional)", required: false }]}
        columns={[{ label: "Name", cell: (r) => r.name }, { label: "Code", cell: (r) => r.code || "—" }, { label: "State", cell: (r) => <ActiveBadge active={r.isActive} /> }]} />
    )
    case "departments": return (
      <MasterTab<Dept> endpoint="/api/settings/departments" addLabel="Add department" noun="department" editable deletePath={(r) => `/api/settings/departments/${r.id}`} patchPath={(r) => `/api/settings/departments/${r.id}`}
        fields={[{ name: "name", label: "Name" }, { name: "code", label: "Code" }]}
        columns={[{ label: "Name", cell: (r) => r.name }, { label: "Code", cell: (r) => r.code }, { label: "State", cell: (r) => <ActiveBadge active={r.isActive} /> }]} />
    )
    case "programs": return (
      <MasterTab<Program> endpoint="/api/settings/programs" addLabel="Add programme" noun="programme" editable deletePath={(r) => `/api/settings/programs/${r.id}`} patchPath={(r) => `/api/settings/programs/${r.id}`}
        fields={[
          { name: "name", label: "Programme name (for example Master of Computer Applications)" }, { name: "code", label: "Code (for example MCA)" },
          { name: "departmentId", label: "Department", type: "select", options: lk.departments, required: true },
          { name: "level", label: "Level", type: "select", options: LEVELS, required: true },
          { name: "qualification", label: "Degree (for example MCA, BCA, B.Tech)", required: false },
          { name: "durationYears", label: "Duration in years", type: "number" }, { name: "semesterCount", label: "Number of semesters", type: "number" },
          { name: "university", label: "Awarding university", required: false },
        ]}
        toBody={toProgramBody} toEditBody={toProgramBody}
        editFields={[
          { name: "name", label: "Programme name" }, { name: "departmentId", label: "Department", type: "select", options: lk.departments, required: true },
          { name: "level", label: "Level", type: "select", options: LEVELS, required: true }, { name: "qualification", label: "Degree", required: false },
          { name: "durationYears", label: "Duration in years", type: "number" }, { name: "semesterCount", label: "Number of semesters", type: "number" }, { name: "university", label: "Awarding university", required: false },
        ]}
        columns={[
          { label: "Programme", cell: (r) => r.name }, { label: "Code", cell: (r) => r.code }, { label: "Department", cell: (r) => r.department?.name ?? "—" },
          { label: "Level", cell: (r) => LEVELS.find((l) => l.value === r.level)?.label ?? r.level }, { label: "Degree", cell: (r) => r.qualification ?? "—" },
          { label: "Duration", cell: (r) => `${r.durationYears} years, ${r.semesterCount} semesters` }, { label: "University", cell: (r) => r.university ?? "—" },
          { label: "Branches", cell: (r) => (r.branches?.length ? r.branches.map((b) => b.name).join(", ") : "—") },
          { label: "State", cell: (r) => <ActiveBadge active={r.isActive} /> },
        ]} />
    )
    case "branches": return (
      <MasterTab<Branch> endpoint="/api/settings/branches" addLabel="Add branch" noun="branch" editable editFields={[{ name: "name", label: "Name" }]} deletePath={(r) => `/api/settings/branches/${r.id}`} patchPath={(r) => `/api/settings/branches/${r.id}`}
        fields={[{ name: "programId", label: "Programme", type: "select", options: lk.programs, required: true }, { name: "name", label: "Branch name (for example Data Science)" }]}
        columns={[{ label: "Branch", cell: (r) => r.name }, { label: "Programme", cell: (r) => lk.programName[r.programId] ?? "—" }, { label: "State", cell: (r) => <ActiveBadge active={r.isActive} /> }]} />
    )
    case "batches": return (
      <MasterTab<Batch> endpoint="/api/settings/batches" addLabel="Add batch" noun="batch" editable deletePath={(r) => `/api/settings/batches/${r.id}`} patchPath={(r) => `/api/settings/batches/${r.id}`}
        fields={[
          { name: "programId", label: "Programme", type: "select", options: lk.programs, required: true },
          { name: "admissionYear", label: "Admission year (for example 2026)", type: "number" },
          { name: "branchId", label: "Branch (optional)", type: "select", options: branchOptions, required: false },
          { name: "coordinatorId", label: "Batch coordinator (optional)", type: "select", options: staffOptions, required: false },
          { name: "status", label: "Status", type: "select", options: BATCH_STATUS, required: true },
        ]}
        toBody={(v) => ({ programId: v.programId, admissionYear: Number(v.admissionYear), branchId: v.branchId || null, coordinatorId: v.coordinatorId || null, status: v.status || "ACTIVE" })}
        editFields={[
          { name: "name", label: "Batch name" }, { name: "branchId", label: "Branch", type: "select", options: branchOptions, required: false },
          { name: "coordinatorId", label: "Batch coordinator", type: "select", options: staffOptions, required: false }, { name: "status", label: "Status", type: "select", options: BATCH_STATUS, required: true },
        ]}
        toEditBody={(v) => ({ name: v.name, branchId: v.branchId || null, coordinatorId: v.coordinatorId || null, status: v.status })}
        columns={[
          { label: "Batch", cell: (r) => r.name }, { label: "Programme", cell: (r) => r.program?.name ?? "—" }, { label: "Branch", cell: (r) => r.branch?.name ?? "—" },
          { label: "Admission year", cell: (r) => r.admissionYear ?? "—" }, { label: "Graduates in", cell: (r) => r.endYear },
          { label: "Coordinator", cell: (r) => r.coordinator?.name ?? "—" }, { label: "Students", cell: (r) => r._count.students },
          { label: "Status", cell: (r) => <Badge variant={r.status === "ACTIVE" ? "default" : r.status === "ARCHIVED" ? "destructive" : "secondary"}>{titleCase(r.status)}</Badge> },
        ]} />
    )
    case "semesters": return <SemestersPanel batches={lk.batches} years={yearOptions} />
    case "years": return (
      <MasterTab<Year> endpoint="/api/settings/academic-years" addLabel="Add academic year" noun="academic year" editable patchPath={(r) => `/api/settings/academic-years/${r.id}`} deletePath={(r) => `/api/settings/academic-years/${r.id}`}
        fields={[{ name: "name", label: "Name (for example 2026-27)" }, { name: "startDate", label: "Starts", type: "date" }, { name: "endDate", label: "Ends", type: "date" }, { name: "status", label: "Status", type: "select", options: SESSION_STATUS, required: true }, { name: "isCurrent", label: "This is the current year", type: "checkbox" }]}
        toBody={(v) => ({ name: v.name, startDate: v.startDate, endDate: v.endDate, status: v.status || "UPCOMING", isCurrent: !!v.isCurrent })}
        columns={[{ label: "Name", cell: (r) => r.name }, { label: "From", cell: (r) => fmtDate(r.startDate) }, { label: "To", cell: (r) => fmtDate(r.endDate) }, { label: "Status", cell: (r) => titleCase(r.status) }, { label: "Current", cell: (r) => (r.isCurrent ? "Yes" : "") }]} />
    )
    case "staff": return (
      <div className="flex flex-col gap-4">
        <StaffPanel />
        <dl className="grid gap-3 rounded-xl bg-muted/50 p-4 text-sm sm:grid-cols-3">
          <div><dt className="font-medium">TPO admin</dt><dd className="text-muted-foreground">Everything, including settings and approvals.</dd></div>
          <div><dt className="font-medium">Placement officer</dt><dd className="text-muted-foreground">Runs drives, students and offers day to day.</dd></div>
          <div><dt className="font-medium">Department coordinator</dt><dd className="text-muted-foreground">Sees and verifies only their own department.</dd></div>
        </dl>
      </div>
    )
  }
}

/** One labelled setting: the explanation on the left, the control on the right. */
function SettingRow({ label, description, htmlFor, children }: { label: string; description?: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex min-w-0 flex-col gap-0.5">
        <label htmlFor={htmlFor} className="text-sm font-medium">{label}</label>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0 sm:w-64 sm:text-right [&_[role=switch]]:sm:ml-auto">{children}</div>
    </div>
  )
}

function SaveBar({ dirty, busy, onSave, onReset }: { dirty: boolean; busy: boolean; onSave: () => void; onReset: () => void }) {
  return (
    <div className="flex items-center justify-end gap-2 border-t pt-4">
      {dirty && <span className="mr-auto text-sm text-muted-foreground">Unsaved changes</span>}
      <Button type="button" variant="ghost" disabled={!dirty || busy} onClick={onReset}>Discard</Button>
      <Button type="button" disabled={!dirty || busy} onClick={onSave}>{busy && <Spinner />}Save changes</Button>
    </div>
  )
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join()

function CollegeForm() {
  const { data, reload } = useApi<{ name: string; logoUrl: string | null; brandColor: string | null }>("/api/settings/college")
  if (!data) return <Skeleton className="h-64 rounded-xl" />
  return <CollegeInner key={`${data.name}|${data.logoUrl}|${data.brandColor}`} data={data} reload={reload} />
}
function CollegeInner({ data, reload }: { data: { name: string; logoUrl: string | null; brandColor: string | null }; reload: () => void }) {
  const [v, setV] = React.useState({ name: data.name, logoUrl: data.logoUrl ?? "", brandColor: data.brandColor ?? "" })
  const [busy, setBusy] = React.useState(false)
  const dirty = v.name !== data.name || v.logoUrl !== (data.logoUrl ?? "") || v.brandColor !== (data.brandColor ?? "")
  const validColour = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.brandColor)
  async function save() {
    setBusy(true)
    try { await api("/api/settings/college", { method: "PATCH", body: { name: v.name, logoUrl: v.logoUrl || null, brandColor: v.brandColor || null } }); toast.success("College profile saved"); reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  return (
    <Card className="rounded-2xl">
      <CardContent className="flex flex-col gap-0 divide-y">
        <SettingRow label="College name" htmlFor="name"><Input id="name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required /></SettingRow>
        <SettingRow label="Logo address" description="A link to your logo image." htmlFor="logoUrl">
          <div className="flex items-center gap-2">
            {v.logoUrl && <span className="size-9 shrink-0 rounded-md border bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url("${v.logoUrl.replace(/"/g, "%22")}")` }} aria-hidden />}
            <Input id="logoUrl" type="url" value={v.logoUrl} onChange={(e) => setV({ ...v, logoUrl: e.target.value })} placeholder="https://" />
          </div>
        </SettingRow>
        <SettingRow label="Brand colour" description="Used in reports and emails. The app keeps its own look." htmlFor="brandColor">
          <div className="flex items-center gap-2">
            <span className="size-9 shrink-0 rounded-md border" style={{ background: validColour ? v.brandColor : "transparent" }} aria-hidden />
            <Input id="brandColor" value={v.brandColor} onChange={(e) => setV({ ...v, brandColor: e.target.value })} placeholder="#1a73e8" />
          </div>
        </SettingRow>
        <div className="pt-4"><SaveBar dirty={dirty} busy={busy} onSave={save} onReset={() => setV({ name: data.name, logoUrl: data.logoUrl ?? "", brandColor: data.brandColor ?? "" })} /></div>
      </CardContent>
    </Card>
  )
}

type Verif = { requiredSections: string[]; requireAssessmentToOnboard: boolean }
function VerificationForm() {
  const { data, reload } = useApi<Verif>("/api/settings/verification")
  if (!data) return <Skeleton className="h-64 rounded-xl" />
  return <VerificationInner key={`${data.requiredSections.join()}|${data.requireAssessmentToOnboard}`} data={data} reload={reload} />
}
function VerificationInner({ data, reload }: { data: Verif; reload: () => void }) {
  const [sections, setSections] = React.useState(data.requiredSections)
  const [assess, setAssess] = React.useState(data.requireAssessmentToOnboard)
  const [busy, setBusy] = React.useState(false)
  const dirty = !sameSet(sections, data.requiredSections) || assess !== data.requireAssessmentToOnboard
  async function save() {
    setBusy(true)
    try { await api("/api/settings/verification", { method: "PATCH", body: { requiredSections: sections, requireAssessmentToOnboard: assess } }); toast.success("Verification rules saved"); reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  return (
    <div className="flex flex-col gap-4">
      <Card className="rounded-2xl">
        <CardHeader><CardTitle>Required sections</CardTitle><CardDescription>A student becomes verified once staff have verified every ticked section. {sections.length} of {SECTIONS.length} required.</CardDescription></CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {SECTIONS.map(([k, label]) => {
            const on = sections.includes(k)
            return (
              <label key={k} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors ${on ? "border-primary/40 bg-primary/5" : "hover:bg-muted/50"}`}>
                <Checkbox checked={on} onCheckedChange={(c) => setSections(c ? [...sections, k] : sections.filter((x) => x !== k))} />{label}
              </label>
            )
          })}
          {sections.length === 0 && <p className="text-sm text-destructive sm:col-span-2">Choose at least one section.</p>}
        </CardContent>
      </Card>
      <Card className="rounded-2xl">
        <CardContent>
          <SettingRow label="Assessment before onboarding" description="Students must finish the personality and aptitude assessment before they can be onboarded.">
            <Switch checked={assess} onCheckedChange={setAssess} aria-label="Require the assessment before onboarding" />
          </SettingRow>
        </CardContent>
      </Card>
      <SaveBar dirty={dirty && sections.length > 0} busy={busy} onSave={save} onReset={() => { setSections(data.requiredSections); setAssess(data.requireAssessmentToOnboard) }} />
    </div>
  )
}

type Pol = { maxOffersPerStudent: number | null; enforceTierUpgrade: boolean; shareRoundScores: boolean; approvalRequired: string[] }
function PoliciesForm() {
  const { data, reload } = useApi<Pol>("/api/settings/policies")
  if (!data) return <Skeleton className="h-64 rounded-xl" />
  return <PoliciesInner key={JSON.stringify(data)} data={data} reload={reload} />
}
function PoliciesInner({ data, reload }: { data: Pol; reload: () => void }) {
  const [max, setMax] = React.useState(data.maxOffersPerStudent?.toString() ?? "")
  const [tier, setTier] = React.useState(data.enforceTierUpgrade)
  const [share, setShare] = React.useState(data.shareRoundScores)
  const [need, setNeed] = React.useState(data.approvalRequired)
  const [busy, setBusy] = React.useState(false)
  const dirty = max !== (data.maxOffersPerStudent?.toString() ?? "") || tier !== data.enforceTierUpgrade || share !== data.shareRoundScores || !sameSet(need, data.approvalRequired)
  async function save() {
    setBusy(true)
    try { await api("/api/settings/policies", { method: "PATCH", body: { maxOffersPerStudent: max ? Number(max) : null, enforceTierUpgrade: tier, shareRoundScores: share, approvalRequired: need } }); toast.success("Policies saved"); reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  return (
    <div className="flex flex-col gap-4">
      <Card className="rounded-2xl">
        <CardHeader><CardTitle>Offer rules</CardTitle></CardHeader>
        <CardContent className="flex flex-col divide-y">
          <SettingRow label="Maximum offers per student" description="Leave empty for no limit." htmlFor="max"><Input id="max" type="number" min={1} max={20} value={max} onChange={(e) => setMax(e.target.value)} placeholder="No limit" className="sm:ml-auto sm:w-32" /></SettingRow>
          <SettingRow label="Higher-tier drives only once placed" description="Placed students may only apply to drives in a higher company tier."><Switch checked={tier} onCheckedChange={setTier} aria-label="Placed students may only apply to higher-tier drives" /></SettingRow>
          <SettingRow label="Show round scores to students" description="Students see their scores and remarks for each round."><Switch checked={share} onCheckedChange={setShare} aria-label="Show students their round scores and remarks" /></SettingRow>
        </CardContent>
      </Card>
      <Card className="rounded-2xl">
        <CardHeader><CardTitle>Needs admin approval</CardTitle><CardDescription>Switched-on actions wait for an admin to approve them before taking effect.</CardDescription></CardHeader>
        <CardContent className="flex flex-col divide-y">
          {APPROVALS.map(([k, label, hint]) => (
            <SettingRow key={k} label={label} description={hint}>
              <Switch checked={need.includes(k)} onCheckedChange={(on) => setNeed(on ? [...need, k] : need.filter((x) => x !== k))} aria-label={`Require approval for ${label.toLowerCase()}`} />
            </SettingRow>
          ))}
        </CardContent>
      </Card>
      <SaveBar dirty={dirty} busy={busy} onSave={save} onReset={() => { setMax(data.maxOffersPerStudent?.toString() ?? ""); setTier(data.enforceTierUpgrade); setShare(data.shareRoundScores); setNeed(data.approvalRequired) }} />
    </div>
  )
}

/** Pick a batch, then manage its semesters. Students stay in the batch while they move through these. */
function SemestersPanel({ batches, years }: { batches: { value: string; label: string }[]; years: { value: string; label: string }[] }) {
  const [batchId, setBatchId] = React.useState("")
  return (
    <div className="flex flex-col gap-3">
      <OptionSelect className="w-full sm:w-72" value={batchId} onChange={setBatchId} options={batches} placeholder="Choose a batch" />
      {!batchId ? <p className="rounded-xl border py-8 text-center text-sm text-muted-foreground">Choose a batch to see its semesters. Semesters are created automatically when a batch is added.</p> : (
        <MasterTab<Semester> key={batchId} endpoint={`/api/settings/semesters?batchId=${batchId}`} addLabel="Add semester" noun="semester" editable deletePath={(r) => `/api/settings/semesters/${r.id}`} patchPath={(r) => `/api/settings/semesters/${r.id}`}
          fields={[{ name: "number", label: "Semester number", type: "number" }, { name: "name", label: "Name (optional)", required: false }]}
          toBody={(v) => ({ batchId, number: Number(v.number), ...(v.name ? { name: v.name } : {}) })}
          editFields={[{ name: "name", label: "Name" }, { name: "academicYearId", label: "Academic year", type: "select", options: years, required: false }, { name: "startDate", label: "Starts", type: "date", required: false }, { name: "endDate", label: "Ends", type: "date", required: false }, { name: "status", label: "Status", type: "select", options: SESSION_STATUS, required: true }]}
          toEditBody={(v) => ({ name: v.name, academicYearId: v.academicYearId || null, startDate: v.startDate || null, endDate: v.endDate || null, status: v.status })}
          columns={[
            { label: "Semester", cell: (r) => r.name }, { label: "Academic year", cell: (r) => r.academicYear?.name ?? "—" },
            { label: "From", cell: (r) => (r.startDate ? fmtDate(r.startDate) : "—") }, { label: "To", cell: (r) => (r.endDate ? fmtDate(r.endDate) : "—") },
            { label: "Students now", cell: (r) => r._count.studentsNow }, { label: "Status", cell: (r) => titleCase(r.status) },
          ]} />
      )}
    </div>
  )
}

type InviteSettings = { inviteExpiryDays: number; dataDeclaration: string | null; defaultDeclaration: string }
function InvitationSettings() {
  const { data, reload } = useApi<InviteSettings>("/api/settings/invitations")
  if (!data) return <Skeleton className="h-64 rounded-xl" />
  return <InvitationSettingsInner key={JSON.stringify(data)} data={data} reload={reload} />
}
function InvitationSettingsInner({ data, reload }: { data: InviteSettings; reload: () => void }) {
  const [days, setDays] = React.useState(String(data.inviteExpiryDays))
  const [text, setText] = React.useState(data.dataDeclaration ?? "")
  const [busy, setBusy] = React.useState(false)
  const dirty = days !== String(data.inviteExpiryDays) || text !== (data.dataDeclaration ?? "")
  async function save() {
    setBusy(true)
    try { await api("/api/settings/invitations", { method: "PATCH", body: { inviteExpiryDays: Number(days), dataDeclaration: text.trim() || null } }); toast.success("Saved"); reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  return (
    <Card className="rounded-2xl">
      <CardHeader><CardTitle>Invitations</CardTitle><CardDescription>Changing the expiry affects invitations sent from now on. Existing ones keep their date until resent.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1"><label htmlFor="days" className="text-sm font-medium">Invitation valid for (days)</label><Input id="days" type="number" min={1} max={60} value={days} onChange={(e) => setDays(e.target.value)} className="w-32" /></div>
        <div className="flex flex-col gap-1">
          <label htmlFor="decl" className="text-sm font-medium">Data declaration</label>
          <textarea id="decl" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={data.defaultDeclaration} className="w-full rounded-lg border bg-transparent p-2 text-sm" />
          <span className="text-xs text-muted-foreground">Leave empty to use the standard wording shown above.</span>
        </div>
        <div><Button onClick={save} disabled={busy || !dirty || !(Number(days) >= 1)}>{busy && <Spinner />}Save</Button></div>
      </CardContent>
    </Card>
  )
}
