"use client"

import * as React from "react"
import Link from "next/link"
import { FilterIcon } from "lucide-react"
import { toast } from "sonner"

import { OptionSelect, type Option } from "@/components/option-select"
import { RowActions } from "@/components/row-actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api, download, toastError } from "@/lib/web/api"
import { useAuth } from "@/lib/web/auth"
import { statusVariant, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Student = {
  id: string; enrollmentNo: string; name: string; email: string; phone?: string | null
  departmentId: string; programId?: string | null; batchId: string
  inviteStatus: string; isActive: boolean; stage: string; isPlaced: boolean; participationStatus: string
  department: { name: string }; program: { name: string; code: string } | null; batch: { name: string; endYear: number }; currentSemester: { name: string } | null
  completion: number; pendingDocs: number; graduationYear: number
}
type Page = { key: string; items: Student[]; next: string | null }
type Dept = { id: string; name: string; isActive: boolean }
type Prog = { id: string; name: string; code: string; departmentId: string | null; isActive: boolean; branches: { id: string; name: string }[] }
type BatchRow = { id: string; name: string; programId: string | null; startYear: number; endYear: number; admissionYear: number | null; isActive: boolean }
type Slice = { id: string; name: string; count: number }
type Summary = { total: number; active: number; inactive: number; placed: number; completion: number; pendingDocs: number; pendingDocStudents: number; byProgram: Slice[]; byDepartment: Slice[]; byBatch: Slice[]; byGraduationYear: Slice[] }

const ANY = (label: string): Option => ({ value: "", label })
const INVITE = [ANY("Any invite status"), { value: "NOT_SENT", label: "Not sent" }, { value: "SENT", label: "Sent" }, { value: "ACTIVATED", label: "Activated" }]
const STAGE = [ANY("Any verification"), { value: "PROFILE_PENDING", label: "Profile pending" }, { value: "VERIFIED", label: "Verified" }, { value: "ONBOARDED", label: "Onboarded" }]
const ACCOUNT = [ANY("Any account status"), { value: "true", label: "Active" }, { value: "false", label: "Deactivated" }]
const DOCS = [ANY("Any documents"), { value: "PENDING", label: "Awaiting verification" }, { value: "VERIFIED", label: "Has verified documents" }, { value: "REJECTED", label: "Has rejected documents" }]
const PLACED = [ANY("Any placement status"), { value: "true", label: "Placed" }, { value: "false", label: "Not placed" }]
const EMPTY = { dept: "", program: "", branch: "", batch: "", semester: "", year: "", admission: "", graduation: "", stage: "", account: "", docs: "", placed: "", invite: "" }

export default function StudentsPage() {
  const { state } = useAuth()
  const canEdit = state.status === "ready" && state.profile.role !== "DEPARTMENT_COORDINATOR"

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
  const lk = { departments: deptOpts, programs: (progs.data ?? []).filter((p) => p.isActive).map((p) => ({ value: p.id, label: p.name })), batches: (batches.data ?? []).filter((b) => b.isActive).map((b) => ({ value: b.id, label: b.name })) }

  const set = (patch: Partial<typeof EMPTY>) => setF((o) => ({ ...o, ...patch }))
  const filterCount = Object.values(f).filter(Boolean).length

  const query = React.useMemo(() => ({
    q: search, departmentId: f.dept, programId: f.program, branchId: f.branch, batchId: f.batch, semesterId: f.semester, academicYearId: f.year,
    admissionYear: f.admission, graduationYear: f.graduation, stage: f.stage, isActive: f.account, docStatus: f.docs, placed: f.placed, inviteStatus: f.invite,
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
  async function syncInvites() {
    try { const r = await api<{ checked: number; activated: number }>("/api/students/invites/sync", { method: "POST" }); toast.success(`${r.activated} of ${r.checked} invited students have activated`); reload() } catch (e) { toastError(e) }
  }
  async function sendInvites(mode: "send" | "resend") {
    setBusy(true)
    try {
      const r = await api<{ sent: number; failed: { email: string; reason: string }[] }>("/api/students/invites", { method: "POST", body: { mode, studentIds: [...selected] } })
      if (r.failed.length) toast.warning(`${r.sent} invites sent, ${r.failed.length} failed`, { description: r.failed.slice(0, 3).map((x) => `${x.email}: ${x.reason}`).join("\n") })
      else toast.success(`${r.sent} invites sent`)
      reload()
    } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  async function setActive(s: Student) {
    try { await api(`/api/students/${s.id}`, { method: "PATCH", body: { isActive: !s.isActive } }); toast.success(s.isActive ? "Student deactivated" : "Student reactivated"); reload() } catch (e) { toastError(e) }
  }

  const actions = (s: Student) => <RowActions viewHref={`/staff/students/${s.id}`} onEdit={canEdit ? () => setEditing(s) : undefined} onToggle={canEdit ? () => setActive(s) : undefined} toggleLabel={s.isActive ? "Deactivate" : "Reactivate"} />
  const placement = (s: Student) => (s.isPlaced ? <Badge>Placed</Badge> : s.participationStatus !== "REGISTERED" ? <Badge variant="secondary">{titleCase(s.participationStatus)}</Badge> : <Badge variant="outline">Not placed</Badge>)
  const account = (s: Student) => (s.isActive ? <Badge variant="outline">{s.inviteStatus === "ACTIVATED" ? "Active" : `Invite ${titleCase(s.inviteStatus).toLowerCase()}`}</Badge> : <Badge variant="destructive">Deactivated</Badge>)
  const verification = (s: Student) => (
    <div className="flex flex-wrap items-center gap-1">
      <Badge variant={statusVariant(s.stage)}>{titleCase(s.stage)}</Badge>
      {s.pendingDocs > 0 && <Badge variant="secondary">{s.pendingDocs} doc{s.pendingDocs > 1 ? "s" : ""} pending</Badge>}
    </div>
  )

  const allSelected = page.items.length > 0 && selected.size === page.items.length
  const toggle = (id: string, on: boolean) => setSelected((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n })

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="Students" value={summary.data?.total} note={summary.data ? `${summary.data.inactive} deactivated` : undefined} />
        <Tile label="Active" value={summary.data?.active} />
        <Tile label="Profile completion" value={summary.data ? `${summary.data.completion}%` : undefined} bar={summary.data?.completion} />
        <Tile label="Documents to verify" value={summary.data?.pendingDocs} note={summary.data ? `${summary.data.pendingDocStudents} students` : undefined} onClick={() => set({ docs: "PENDING" })} />
        <Tile label="Placed" value={summary.data?.placed} onClick={() => set({ placed: "true" })} />
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
            {selected.size > 0 && (<>
              <Button variant="outline" disabled={busy} onClick={() => sendInvites("send")}>{busy && <Spinner />}Send invites ({selected.size})</Button>
              <Button variant="outline" disabled={busy} onClick={() => sendInvites("resend")}>Resend invites</Button>
            </>)}
            <Button variant="outline" onClick={() => download("/api/students/export", { query }).catch(toastError)}>Export</Button>
            <Button variant="outline" onClick={syncInvites}>Check activations</Button>
            <Button variant="outline" render={<Link href="/staff/students/progression" />}>Semester progression</Button>
            <Button variant="outline" render={<Link href="/staff/students/import" />}>Import</Button>
            <Button render={<Link href="/staff/students/new" />}>Add student</Button>
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
          <OptionSelect className="w-full" value={f.stage} onChange={(v) => set({ stage: v })} options={STAGE} placeholder="Verification" />
          <OptionSelect className="w-full" value={f.docs} onChange={(v) => set({ docs: v })} options={DOCS} placeholder="Documents" />
          <OptionSelect className="w-full" value={f.placed} onChange={(v) => set({ placed: v })} options={PLACED} placeholder="Placement" />
          <OptionSelect className="w-full" value={f.account} onChange={(v) => set({ account: v })} options={ACCOUNT} placeholder="Account" />
          <OptionSelect className="w-full" value={f.invite} onChange={(v) => set({ invite: v })} options={INVITE} placeholder="Invite status" />
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
                <TableHead>Student</TableHead><TableHead>Admission no</TableHead><TableHead>Department</TableHead><TableHead>Programme</TableHead><TableHead>Batch</TableHead>
                <TableHead>Semester</TableHead><TableHead>Graduates</TableHead><TableHead>Profile</TableHead><TableHead>Verification</TableHead><TableHead>Placement</TableHead><TableHead>Account</TableHead>
                <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((s) => (
                <TableRow key={s.id} data-state={selected.has(s.id) ? "selected" : undefined} className={s.isActive ? "" : "opacity-60"}>
                  {canEdit && <TableCell><Checkbox checked={selected.has(s.id)} onCheckedChange={(on) => toggle(s.id, !!on)} aria-label={`Select ${s.name}`} /></TableCell>}
                  <TableCell><Link href={`/staff/students/${s.id}`} className="font-medium underline-offset-4 hover:underline">{s.name}</Link><div className="text-xs text-muted-foreground">{s.email}</div></TableCell>
                  <TableCell>{s.enrollmentNo}</TableCell>
                  <TableCell>{s.department.name}</TableCell>
                  <TableCell>{s.program?.code ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{s.batch.name}</TableCell>
                  <TableCell className="whitespace-nowrap">{s.currentSemester?.name ?? "—"}</TableCell>
                  <TableCell>{s.graduationYear}</TableCell>
                  <TableCell><Completion value={s.completion} /></TableCell>
                  <TableCell>{verification(s)}</TableCell>
                  <TableCell>{placement(s)}</TableCell>
                  <TableCell>{account(s)}</TableCell>
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
                <dt className="text-muted-foreground">Department</dt><dd>{s.department.name}</dd>
                <dt className="text-muted-foreground">Programme</dt><dd>{s.program?.name ?? "—"}</dd>
                <dt className="text-muted-foreground">Batch</dt><dd>{s.batch.name}</dd>
                <dt className="text-muted-foreground">Semester</dt><dd>{s.currentSemester?.name ?? "—"}</dd>
                <dt className="text-muted-foreground">Graduates</dt><dd>{s.graduationYear}</dd>
                <dt className="text-muted-foreground">Profile</dt><dd><Completion value={s.completion} /></dd>
              </dl>
              <div className="flex flex-wrap gap-2">{verification(s)}{placement(s)}{account(s)}</div>
            </div>
          ))}
        </div>
      </>)}
      {page.next && <div className="flex justify-center"><Button variant="outline" disabled={more} onClick={loadMore}>{more && <Spinner />}Load more</Button></div>}
      <EditStudentDialog student={editing} onClose={() => setEditing(null)} onSaved={reload} lk={lk} />
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

type Lookups = { departments: Option[]; programs: Option[]; batches: Option[] }

function EditStudentDialog({ student, onClose, onSaved, lk }: { student: Student | null; onClose: () => void; onSaved: () => void; lk: Lookups }) {
  return (
    <Dialog open={!!student} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit student</DialogTitle><DialogDescription>Admission number and email cannot be changed here. The department, programme and batch must fit together.</DialogDescription></DialogHeader>
        {student && <EditStudentForm key={student.id} student={student} onClose={onClose} onSaved={onSaved} lk={lk} />}
      </DialogContent>
    </Dialog>
  )
}

function EditStudentForm({ student, onClose, onSaved, lk }: { student: Student; onClose: () => void; onSaved: () => void; lk: Lookups }) {
  const [dept, setDept] = React.useState(student.departmentId)
  const [batch, setBatch] = React.useState(student.batchId)
  const [program, setProgram] = React.useState(student.programId ?? "")
  const [busy, setBusy] = React.useState(false)
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const phone = String(fd.get("phone") ?? "").trim()
    setBusy(true)
    try {
      await api(`/api/students/${student.id}`, { method: "PATCH", body: { name: String(fd.get("name")).trim(), phone: phone || null, departmentId: dept, batchId: batch, programId: program || null } })
      toast.success("Student updated")
      onClose(); onSaved()
    } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={save}>
      <FieldGroup>
        <Field><FieldLabel htmlFor="ename">Full name</FieldLabel><Input id="ename" name="name" minLength={2} defaultValue={student.name} required /></Field>
        <Field><FieldLabel htmlFor="ephone">Phone</FieldLabel><Input id="ephone" name="phone" type="tel" defaultValue={student.phone ?? ""} /></Field>
        <Field><FieldLabel>Department</FieldLabel><OptionSelect className="w-full" value={dept} onChange={setDept} options={lk.departments} placeholder="Choose a department" /></Field>
        <Field><FieldLabel>Batch</FieldLabel><OptionSelect className="w-full" value={batch} onChange={setBatch} options={lk.batches} placeholder="Choose a batch" /></Field>
        {lk.programs.length > 0 && <Field><FieldLabel>Programme (optional)</FieldLabel><OptionSelect className="w-full" value={program} onChange={setProgram} options={[{ value: "", label: "From the batch" }, ...lk.programs]} placeholder="Choose a programme" /></Field>}
      </FieldGroup>
      <DialogFooter className="mt-4"><Button type="submit" disabled={busy}>{busy && <Spinner />}Save changes</Button></DialogFooter>
    </form>
  )
}
