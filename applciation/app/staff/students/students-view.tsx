"use client"

import * as React from "react"
import Link from "next/link"
import { FilterIcon, UserPlusIcon, UsersIcon } from "lucide-react"
import { toast } from "sonner"

import { OptionSelect, type Option } from "@/components/option-select"
import { EditStudentDialog } from "@/components/edit-student-dialog"
import { StudentActionMenu } from "@/components/onboarding-actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api, download, toastError } from "@/lib/web/api"
import { isCoordinatorOnly, useAuth } from "@/lib/web/auth"
import { fmtDateTime, statusVariant } from "@/lib/web/format"
import { INVITATION_LABEL, ONBOARDING_LABEL, VERIFICATION_LABEL, verificationOf } from "@/lib/web/onboarding"
import { useApi } from "@/lib/web/use-api"

type Student = {
  id: string; enrollmentNo: string; name: string; email: string; phone?: string | null
  departmentId: string; programId?: string | null; batchId: string; branchId?: string | null; campusId?: string | null; admissionYear?: number | null
  inviteStatus: string; onboardingStatus: string; lastActivityAt: string | null; updatedAt: string; invitation: { status: string; expiresAt: string; sentAt: string | null; graduationYear: number | null } | null
  isActive: boolean; stage: string; isPlaced: boolean; participationStatus: string
  department: { name: string }; program: { name: string; code: string } | null; batch: { name: string; endYear: number }; currentSemester: { name: string } | null
  completion: number; pendingDocs: number; graduationYear: number
}
type Page = { key: string; items: Student[]; next: string | null }
type Dept = { id: string; name: string; isActive: boolean }
type Prog = { id: string; name: string; code: string; departmentId: string | null; isActive: boolean; branches: { id: string; name: string }[] }
type BatchRow = { id: string; name: string; programId: string | null; startYear: number; endYear: number; admissionYear: number | null; isActive: boolean }
type Slice = { id: string; name: string; count: number }
type Summary = { onboarding: { invitationsSent: number; pendingAcceptance: number; profileInProgress: number; pendingVerification: number; verified: number }; total: number; active: number; inactive: number; placed: number; completion: number; pendingDocs: number; pendingDocStudents: number; byProgram: Slice[]; byDepartment: Slice[]; byBatch: Slice[]; byGraduationYear: Slice[] }

const ANY = (label: string): Option => ({ value: "", label })
const opts = (label: string, labels: Record<string, string>) => [ANY(label), ...Object.entries(labels).map(([value, l]) => ({ value, label: l }))]
const INVITATION = opts("Any invitation status", INVITATION_LABEL)
const PROFILE = opts("Any profile status", ONBOARDING_LABEL)
const VERIFICATION = opts("Any verification status", VERIFICATION_LABEL)
const ACCOUNT = [ANY("Any account status"), { value: "true", label: "Active" }, { value: "false", label: "Deactivated" }]
const DOCS = [ANY("Any documents"), { value: "PENDING", label: "Awaiting verification" }, { value: "VERIFIED", label: "Has verified documents" }, { value: "REJECTED", label: "Has rejected documents" }]
const PLACED = [ANY("Any placement status"), { value: "true", label: "Placed" }, { value: "false", label: "Not placed" }]
const EMPTY = { dept: "", program: "", branch: "", batch: "", semester: "", year: "", admission: "", graduation: "", invitation: "", profile: "", verification: "", account: "", docs: "", placed: "" }

export function StudentsView() {
  const { state } = useAuth()
  const canEdit = state.status === "ready" && !isCoordinatorOnly(state.profile)

  const [q, setQ] = React.useState("")
  const [f, setF] = React.useState(EMPTY)
  const [showFilters, setShowFilters] = React.useState(false)
  const search = React.useDeferredValue(q)
  const [tick, setTick] = React.useState(0)
  const [page, setPage] = React.useState<Page>({ key: "", items: [], next: null })
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [more, setMore] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [editing, setEditing] = React.useState<Student | null>(null)

  const depts = useApi<Dept[]>("/api/settings/departments")
  const progs = useApi<Prog[]>("/api/settings/programs")
  const batches = useApi<BatchRow[]>("/api/settings/batches")
  const years = useApi<{ id: string; name: string }[]>("/api/settings/academic-years")
  const sems = useApi<{ id: string; name: string }[]>(f.batch ? "/api/settings/semesters" : null, { batchId: f.batch })

  // Each filter only offers what fits the ones above it.
  const deptOpts = (depts.data ?? []).filter((d) => d.isActive).map((d) => ({ value: d.id, label: d.name }))
  const programs = (progs.data ?? []).filter((p) => p.isActive && (!f.dept || !p.departmentId || p.departmentId === f.dept))
  const program = programs.find((p) => p.id === f.program)
  const batchList = (batches.data ?? []).filter((b) => b.isActive && (!f.program || b.programId === f.program))
  const gradYears = [...new Set((batches.data ?? []).map((b) => b.endYear))].sort((a, b) => b - a)
  const admYears = [...new Set((batches.data ?? []).map((b) => b.admissionYear ?? b.startYear))].sort((a, b) => b - a)

  const set = (patch: Partial<typeof EMPTY>) => setF((o) => ({ ...o, ...patch }))
  const filterCount = Object.values(f).filter(Boolean).length

  const query = React.useMemo(() => ({
    q: search, departmentId: f.dept, programId: f.program, branchId: f.branch, batchId: f.batch, semesterId: f.semester, academicYearId: f.year,
    admissionYear: f.admission, graduationYear: f.graduation, invitationStatus: f.invitation, profileStatus: f.profile, verificationStatus: f.verification, isActive: f.account, docStatus: f.docs, placed: f.placed,
  }), [search, f])
  const key = `${tick}|${JSON.stringify(query)}`

  const summary = useApi<Summary>("/api/students/summary", query)

  React.useEffect(() => {
    let alive = true
    api<{ items: Student[]; nextCursor: string | null }>("/api/students", { query: { ...query, limit: 50 } })
      .then((r) => { if (alive) { setPage({ key, items: r.items, next: r.nextCursor }); setSelected(new Set()) } })
      .catch((e) => { if (alive) { setPage({ key, items: [], next: null }); toastError(e) } })
    return () => { alive = false }
  }, [key, query])

  const loading = page.key !== key
  const reload = () => { setTick((t) => t + 1); summary.reload() }

  async function loadMore() {
    if (!page.next) return
    setMore(true)
    try {
      const r = await api<{ items: Student[]; nextCursor: string | null }>("/api/students", { query: { ...query, limit: 50, cursor: page.next } })
      setPage((p) => ({ ...p, items: [...p.items, ...r.items], next: r.nextCursor }))
    } catch (e) { toastError(e) } finally { setMore(false) }
  }
  async function resendSelected() {
    setBusy(true)
    try {
      const r = await api<{ queued: number; moreRemaining: boolean }>("/api/students/invites", { method: "POST", body: { mode: "resend", studentIds: [...selected] } })
      toast.success(`${r.queued} invitation${r.queued === 1 ? "" : "s"} are being emailed`, { description: "New links replace the old ones." })
      reload()
    } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  async function setActive(s: Student) {
    try { await api(`/api/students/${s.id}`, { method: "PATCH", body: { isActive: !s.isActive } }); toast.success(s.isActive ? "Student deactivated" : "Student reactivated"); reload() } catch (e) { toastError(e) }
  }

  const actions = (s: Student) => <StudentActionMenu student={s} canInvite={canEdit} onChanged={reload} onEdit={canEdit ? () => setEditing(s) : undefined} onToggle={canEdit ? () => setActive(s) : undefined} />
  const invitation = (s: Student) => (s.invitation ? <Badge variant={statusVariant(s.invitation.status)}>{INVITATION_LABEL[s.invitation.status]}</Badge> : <Badge variant="outline">{s.inviteStatus === "ACTIVATED" ? "Accepted" : "None"}</Badge>)
  const verification = (s: Student) => {
    const v = verificationOf(s.onboardingStatus)
    return (
      <div className="flex flex-wrap items-center gap-1">
        <Badge variant={statusVariant(v)}>{VERIFICATION_LABEL[v]}</Badge>
        {s.pendingDocs > 0 && <Badge variant="secondary">{s.pendingDocs} doc{s.pendingDocs > 1 ? "s" : ""} pending</Badge>}
      </div>
    )
  }
  const lastActive = (s: Student) => fmtDateTime(s.lastActivityAt ?? s.invitation?.sentAt ?? s.updatedAt)

  const allSelected = page.items.length > 0 && selected.size === page.items.length
  const toggle = (id: string, on: boolean) => setSelected((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n })

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Tile label="Total students" value={summary.data?.total} note={summary.data ? `${summary.data.inactive} deactivated` : undefined} onClick={() => setF(EMPTY)} />
        <Tile label="Invitations sent" value={summary.data?.onboarding.invitationsSent} />
        <Tile label="Pending acceptance" value={summary.data?.onboarding.pendingAcceptance} onClick={() => set({ profile: "INVITATION_SENT" })} />
        <Tile label="Profile in progress" value={summary.data?.onboarding.profileInProgress} onClick={() => set({ profile: "PROFILE_IN_PROGRESS" })} />
        <Tile label="Pending verification" value={summary.data?.onboarding.pendingVerification} onClick={() => set({ verification: "IN_REVIEW" })} />
        <Tile label="Verified students" value={summary.data?.onboarding.verified} onClick={() => set({ verification: "VERIFIED" })} />
      </div>

      <div className="rounded-xl border p-3">
        <Tabs defaultValue="program">
          <TabsList>
            <TabsTrigger value="program">Programme</TabsTrigger>
            <TabsTrigger value="department">Department</TabsTrigger>
            <TabsTrigger value="batch">Batch</TabsTrigger>
            <TabsTrigger value="year">Graduation year</TabsTrigger>
          </TabsList>
          <TabsContent value="program"><Breakdown slices={summary.data?.byProgram} onPick={(id) => set({ program: id === "none" ? "" : id })} /></TabsContent>
          <TabsContent value="department"><Breakdown slices={summary.data?.byDepartment} onPick={(id) => set({ dept: id === "none" ? "" : id, program: "", batch: "", semester: "", branch: "" })} /></TabsContent>
          <TabsContent value="batch"><Breakdown slices={summary.data?.byBatch} onPick={(id) => set({ batch: id === "none" ? "" : id, semester: "" })} /></TabsContent>
          <TabsContent value="year"><Breakdown slices={summary.data?.byGraduationYear} onPick={(id) => set({ graduation: id })} /></TabsContent>
        </Tabs>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-full sm:w-64" placeholder="Search name, admission no, email" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button variant="outline" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}><FilterIcon />Filters{filterCount > 0 && <Badge className="ml-1">{filterCount}</Badge>}</Button>
        {filterCount > 0 && <Button variant="ghost" onClick={() => setF(EMPTY)}>Clear filters</Button>}
        {canEdit && (
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            {selected.size > 0 && <Button variant="outline" disabled={busy} onClick={resendSelected}>{busy && <Spinner />}Resend invitations ({selected.size})</Button>}
            <Button variant="outline" onClick={() => download("/api/students/export", { query }).catch(toastError)}>Export</Button>
            <Button variant="outline" render={<Link href="/staff/students/progression" />}>Semester progression</Button>
            <Button variant="outline" render={<Link href="/staff/students/import" />}><UsersIcon />Bulk invite students</Button>
            <Button render={<Link href="/staff/students/invite" />}><UserPlusIcon />Invite student</Button>
          </div>
        )}
      </div>

      {showFilters && (
        <div className="grid grid-cols-1 gap-2 rounded-xl border p-3 sm:grid-cols-2 lg:grid-cols-4">
          <OptionSelect className="w-full" value={f.dept} onChange={(v) => set({ dept: v, program: "", branch: "", batch: "", semester: "" })} options={[ANY("All departments"), ...deptOpts]} placeholder="Department" />
          <OptionSelect className="w-full" value={f.program} onChange={(v) => set({ program: v, branch: "", batch: "", semester: "" })} options={[ANY("All programmes"), ...programs.map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }))]} placeholder="Programme" />
          <OptionSelect className="w-full" value={f.branch} onChange={(v) => set({ branch: v })} options={[ANY(program ? "All branches" : "Choose a programme for branches"), ...(program?.branches ?? []).map((b) => ({ value: b.id, label: b.name }))]} placeholder="Branch" />
          <OptionSelect className="w-full" value={f.batch} onChange={(v) => set({ batch: v, semester: "" })} options={[ANY("All batches"), ...batchList.map((b) => ({ value: b.id, label: b.name }))]} placeholder="Batch" />
          <OptionSelect className="w-full" value={f.semester} onChange={(v) => set({ semester: v })} options={[ANY(f.batch ? "All semesters" : "Choose a batch for semesters"), ...(sems.data ?? []).map((m) => ({ value: m.id, label: m.name }))]} placeholder="Semester" />
          <OptionSelect className="w-full" value={f.year} onChange={(v) => set({ year: v })} options={[ANY("Any academic year"), ...(years.data ?? []).map((y) => ({ value: y.id, label: y.name }))]} placeholder="Academic year" />
          <OptionSelect className="w-full" value={f.admission} onChange={(v) => set({ admission: v })} options={[ANY("Any admission year"), ...admYears.map((y) => ({ value: String(y), label: String(y) }))]} placeholder="Admission year" />
          <OptionSelect className="w-full" value={f.graduation} onChange={(v) => set({ graduation: v })} options={[ANY("Any graduation year"), ...gradYears.map((y) => ({ value: String(y), label: String(y) }))]} placeholder="Graduation year" />
          <OptionSelect className="w-full" value={f.invitation} onChange={(v) => set({ invitation: v })} options={INVITATION} placeholder="Invitation status" />
          <OptionSelect className="w-full" value={f.profile} onChange={(v) => set({ profile: v })} options={PROFILE} placeholder="Profile status" />
          <OptionSelect className="w-full" value={f.verification} onChange={(v) => set({ verification: v })} options={VERIFICATION} placeholder="Verification status" />
          <OptionSelect className="w-full" value={f.docs} onChange={(v) => set({ docs: v })} options={DOCS} placeholder="Documents" />
          <OptionSelect className="w-full" value={f.placed} onChange={(v) => set({ placed: v })} options={PLACED} placeholder="Placement" />
          <OptionSelect className="w-full" value={f.account} onChange={(v) => set({ account: v })} options={ACCOUNT} placeholder="Account" />
        </div>
      )}

      {loading && page.items.length === 0 ? (
        <div className="flex flex-col gap-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : page.items.length === 0 ? (
        <Empty><EmptyHeader><EmptyTitle>No students found</EmptyTitle><EmptyDescription>Change the filters, or import a spreadsheet of admitted students.</EmptyDescription></EmptyHeader></Empty>
      ) : (<>
        <div className="hidden overflow-x-auto rounded-xl border lg:block">
          <Table>
            <TableHeader>
              <TableRow>
                {canEdit && <TableHead className="w-8"><Checkbox checked={allSelected} onCheckedChange={(on) => setSelected(on ? new Set(page.items.map((s) => s.id)) : new Set())} aria-label="Select all" /></TableHead>}
                <TableHead>Student name</TableHead><TableHead>Admission no</TableHead><TableHead>Email</TableHead><TableHead>Programme</TableHead><TableHead>Batch</TableHead>
                <TableHead>Invitation</TableHead><TableHead>Profile completion</TableHead><TableHead>Verification</TableHead><TableHead>Last activity</TableHead>
                <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((s) => (
                <TableRow key={s.id} data-state={selected.has(s.id) ? "selected" : undefined} className={s.isActive ? "" : "opacity-60"}>
                  {canEdit && <TableCell><Checkbox checked={selected.has(s.id)} onCheckedChange={(on) => toggle(s.id, !!on)} aria-label={`Select ${s.name}`} /></TableCell>}
                  <TableCell><Link href={`/staff/students/${s.id}`} className="font-medium underline-offset-4 hover:underline">{s.name}</Link>{!s.isActive && <Badge className="ml-2" variant="destructive">Deactivated</Badge>}</TableCell>
                  <TableCell>{s.enrollmentNo}</TableCell>
                  <TableCell className="max-w-48 truncate">{s.email}</TableCell>
                  <TableCell>{s.program?.code ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{s.batch.name}</TableCell>
                  <TableCell>{invitation(s)}<div className="text-xs text-muted-foreground">{ONBOARDING_LABEL[s.onboardingStatus]}</div></TableCell>
                  <TableCell><Completion value={s.completion} /></TableCell>
                  <TableCell>{verification(s)}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{lastActive(s)}</TableCell>
                  <TableCell className="text-right">{actions(s)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-col gap-2 lg:hidden">
          {page.items.map((s) => (
            <div key={s.id} className={`flex flex-col gap-2 rounded-xl border p-3 text-sm ${s.isActive ? "" : "opacity-60"}`}>
              <div className="flex items-start gap-2">
                {canEdit && <Checkbox className="mt-1" checked={selected.has(s.id)} onCheckedChange={(on) => toggle(s.id, !!on)} aria-label={`Select ${s.name}`} />}
                <Link href={`/staff/students/${s.id}`} className="min-w-0 flex-1"><div className="font-medium">{s.name}</div><div className="truncate text-xs text-muted-foreground">{s.email}</div></Link>
                {actions(s)}
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt className="text-muted-foreground">Admission no</dt><dd>{s.enrollmentNo}</dd>
                <dt className="text-muted-foreground">Programme</dt><dd>{s.program?.name ?? "—"}</dd>
                <dt className="text-muted-foreground">Batch</dt><dd>{s.batch.name}</dd>
                <dt className="text-muted-foreground">Completion</dt><dd><Completion value={s.completion} /></dd>
                <dt className="text-muted-foreground">Last activity</dt><dd>{lastActive(s)}</dd>
              </dl>
              <div className="flex flex-wrap gap-2">{invitation(s)}{verification(s)}</div>
            </div>
          ))}
        </div>
      </>)}
      {page.next && <div className="flex justify-center"><Button variant="outline" disabled={more} onClick={loadMore}>{more && <Spinner />}Load more</Button></div>}
      <EditStudentDialog studentId={editing?.id ?? null} onClose={() => setEditing(null)} onSaved={reload} />
    </div>
  )
}

function Tile({ label, value, note, bar, onClick }: { label: string; value?: number | string; note?: string; bar?: number; onClick?: () => void }) {
  const body = (<>
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="text-2xl font-semibold tabular-nums">{value ?? <Skeleton className="h-8 w-16" />}</span>
    {bar !== undefined && <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${bar}%` }} /></div>}
    {note && <span className="text-xs text-muted-foreground">{note}</span>}
  </>)
  const cls = "flex flex-col items-start gap-1 rounded-xl border p-3 text-left"
  return onClick ? <button type="button" onClick={onClick} className={`${cls} transition-colors hover:bg-muted/50`}>{body}</button> : <div className={cls}>{body}</div>
}

/** Horizontal bars for one breakdown. Clicking a row filters the list to it. */
function Breakdown({ slices, onPick }: { slices?: Slice[]; onPick: (id: string) => void }) {
  if (!slices) return <Skeleton className="mt-2 h-24" />
  if (!slices.length) return <p className="py-4 text-sm text-muted-foreground">Nothing to show.</p>
  const max = Math.max(...slices.map((s) => s.count))
  return (
    <ul className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
      {slices.slice(0, 8).map((s) => (
        <li key={s.id}>
          <button type="button" onClick={() => onPick(s.id)} className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-sm hover:bg-muted/50">
            <span className="w-32 shrink-0 truncate sm:w-40">{s.name}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary/70" style={{ width: `${(s.count / max) * 100}%` }} /></span>
            <span className="w-10 text-right tabular-nums text-muted-foreground">{s.count}</span>
          </button>
        </li>
      ))}
      {slices.length > 8 && <li className="px-1 text-xs text-muted-foreground">and {slices.length - 8} more. Use the filters to narrow down.</li>}
    </ul>
  )
}

function Completion({ value }: { value: number }) {
  return (
    <div className="flex min-w-24 items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} /></div>
      <span className="text-xs tabular-nums text-muted-foreground">{value}%</span>
    </div>
  )
}
