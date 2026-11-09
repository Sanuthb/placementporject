"use client"

import * as React from "react"
import { DownloadIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { DocumentViewer } from "@/components/document-viewer"
import { DocumentReading } from "@/components/document-reading"
import { OptionSelect } from "@/components/option-select"
import { ConfirmDelete } from "@/components/row-actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { DOC_CATEGORIES, EDUCATION_LEVELS } from "@/lib/academicConstants"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, statusVariant, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Edu = {
  id: string; level: string; qualification: string; specialisation: string | null; institution: string; boardOrUniversity: string | null; rollNo: string | null
  admissionYear: number | null; completionYear: number | null; percentage: string | number | null; cgpa: string | number | null
  maxMarks: number | null; obtainedMarks: number | null; backlogs: number; status: string; isCurrent: boolean; reviewStatus?: string; pendingData?: unknown
}
type Doc = { id: string; category: string; fileName: string; mimeType: string; sizeBytes: number; status: string; verifiedAt: string | null; rejectReason: string | null; createdAt: string; url: string | null; verifiedBy: { name: string } | null; archivedAt?: string | null; archiveReason?: string | null; replacesId?: string | null }

const LEVELS = EDUCATION_LEVELS.map((v) => ({ value: v, label: v }))
const STATUSES = ["COMPLETED", "PURSUING", "DISCONTINUED"].map((v) => ({ value: v, label: titleCase(v) }))
const CATS = DOC_CATEGORIES.map(([value, label]) => ({ value, label }))
const catLabel = (c: string) => CATS.find((x) => x.value === c)?.label ?? c
const n = (v: string) => (v.trim() === "" ? null : Number(v))
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v))

/** The student's qualifications, one record each, with add / edit / delete. */
export function EducationPanel({ studentId, canEdit }: { studentId: string; canEdit: boolean }) {
  const { data, loading, reload } = useApi<Edu[]>(`/api/students/${studentId}/education`)
  const [editing, setEditing] = React.useState<Edu | "new" | null>(null)
  const [deleting, setDeleting] = React.useState<Edu | null>(null)
  const [busy, setBusy] = React.useState(false)

  async function remove() {
    if (!deleting) return
    setBusy(true)
    try { await api(`/api/students/${studentId}/education/${deleting.id}`, { method: "DELETE" }); toast.success("Qualification removed"); setDeleting(null); reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }

  if (loading && !data) return <Skeleton className="h-40 rounded-xl" />
  return (
    <div className="flex flex-col gap-3">
      {canEdit && <div><Button onClick={() => setEditing("new")}><PlusIcon />Add qualification</Button></div>}
      {data?.length === 0 && <p className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">No education records yet.</p>}
      {data?.map((r) => (
        <div key={r.id} className="flex flex-col gap-2 rounded-xl border p-3 text-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium">{r.qualification}{r.specialisation ? `, ${r.specialisation}` : ""}</div>
              <div className="text-muted-foreground">{r.institution}{r.boardOrUniversity ? ` · ${r.boardOrUniversity}` : ""}</div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {r.isCurrent && <Badge>Current</Badge>}
              {r.reviewStatus && <Badge variant={r.pendingData ? "secondary" : statusVariant(r.reviewStatus)}>{r.pendingData ? "Revision pending" : titleCase(r.reviewStatus)}</Badge>}
              <Badge variant="outline">{titleCase(r.status)}</Badge>
              {canEdit && <>
                <Button variant="ghost" size="icon-sm" aria-label="Edit qualification" onClick={() => setEditing(r)}><PencilIcon /></Button>
                <Button variant="ghost" size="icon-sm" aria-label="Remove qualification" onClick={() => setDeleting(r)}><Trash2Icon /></Button>
              </>}
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
            <div><dt className="text-muted-foreground">Level</dt><dd>{r.level}</dd></div>
            <div><dt className="text-muted-foreground">Years</dt><dd>{r.admissionYear ?? "—"} to {r.completionYear ?? "—"}</dd></div>
            <div><dt className="text-muted-foreground">Percentage</dt><dd>{r.percentage ?? "—"}</dd></div>
            <div><dt className="text-muted-foreground">CGPA</dt><dd>{r.cgpa ?? "—"}</dd></div>
            <div><dt className="text-muted-foreground">Backlogs</dt><dd>{r.backlogs}</dd></div>
            {r.rollNo && <div><dt className="text-muted-foreground">Roll number</dt><dd>{r.rollNo}</dd></div>}
            {r.maxMarks != null && <div><dt className="text-muted-foreground">Marks</dt><dd>{r.obtainedMarks ?? "—"} / {r.maxMarks}</dd></div>}
          </dl>
        </div>
      ))}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editing === "new" ? "Add qualification" : "Edit qualification"}</DialogTitle></DialogHeader>
          {editing && <EduForm key={editing === "new" ? "new" : editing.id} studentId={studentId} initial={editing === "new" ? null : editing} onDone={() => { setEditing(null); reload() }} />}
        </DialogContent>
      </Dialog>
      <ConfirmDelete open={!!deleting} what={deleting ? `${deleting.qualification}` : "this qualification"} busy={busy} onConfirm={remove} onClose={() => setDeleting(null)} />
    </div>
  )
}

function EduForm({ studentId, initial, onDone }: { studentId: string; initial: Edu | null; onDone: () => void }) {
  const [v, setV] = React.useState({
    level: initial?.level ?? "", qualification: initial?.qualification ?? "", specialisation: s(initial?.specialisation), institution: s(initial?.institution),
    boardOrUniversity: s(initial?.boardOrUniversity), rollNo: s(initial?.rollNo), admissionYear: s(initial?.admissionYear), completionYear: s(initial?.completionYear),
    percentage: s(initial?.percentage), cgpa: s(initial?.cgpa), maxMarks: s(initial?.maxMarks), obtainedMarks: s(initial?.obtainedMarks),
    backlogs: s(initial?.backlogs ?? 0), status: initial?.status ?? "COMPLETED", isCurrent: initial?.isCurrent ?? false,
  })
  const [busy, setBusy] = React.useState(false)
  const set = (k: keyof typeof v, x: string | boolean) => setV((o) => ({ ...o, [k]: x }))
  const text = (k: keyof typeof v, label: string, type = "text") => (
    <Field><FieldLabel>{label}</FieldLabel><Input type={type} step={type === "number" ? "any" : undefined} value={String(v[k])} onChange={(e) => set(k, e.target.value)} /></Field>
  )

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!v.level) return toast.error("Choose a level")
    setBusy(true)
    try {
      const body = {
        level: v.level, qualification: v.qualification.trim(), specialisation: v.specialisation.trim() || null, institution: v.institution.trim(),
        boardOrUniversity: v.boardOrUniversity.trim() || null, rollNo: v.rollNo.trim() || null, admissionYear: n(v.admissionYear), completionYear: n(v.completionYear),
        percentage: n(v.percentage), cgpa: n(v.cgpa), maxMarks: n(v.maxMarks), obtainedMarks: n(v.obtainedMarks), backlogs: Number(v.backlogs || 0), status: v.status, isCurrent: v.isCurrent,
      }
      await api(initial ? `/api/students/${studentId}/education/${initial.id}` : `/api/students/${studentId}/education`, { method: initial ? "PATCH" : "POST", body })
      toast.success(initial ? "Qualification updated" : "Qualification added")
      onDone()
    } catch (err) { toastError(err) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field><FieldLabel>Level</FieldLabel><OptionSelect className="w-full" value={v.level} onChange={(x) => set("level", x)} options={LEVELS} placeholder="Choose a level" /></Field>
        {text("qualification", "Qualification")}
        {text("specialisation", "Specialisation / branch")}
        {text("institution", "Institution")}
        {text("boardOrUniversity", "University / board")}
        {text("rollNo", "Registration / roll number")}
        {text("admissionYear", "Admission year", "number")}
        {text("completionYear", "Completion year", "number")}
        {text("percentage", "Percentage", "number")}
        {text("cgpa", "CGPA", "number")}
        {text("maxMarks", "Maximum marks", "number")}
        {text("obtainedMarks", "Obtained marks", "number")}
        {text("backlogs", "Backlogs", "number")}
        <Field><FieldLabel>Status</FieldLabel><OptionSelect className="w-full" value={v.status} onChange={(x) => set("status", x)} options={STATUSES} placeholder="Status" /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={v.isCurrent} onCheckedChange={(on) => set("isCurrent", !!on)} />This is the qualification the student is pursuing now</label>
      <DialogFooter><Button type="submit" disabled={busy}>{busy && <Spinner />}{initial ? "Save changes" : "Add qualification"}</Button></DialogFooter>
    </form>
  )
}

const docVariant = (st: string) => (st === "VERIFIED" ? "default" : st === "REJECTED" ? "destructive" : "secondary")

/** Academic documents with their own verification state. Staff can verify, reject, reopen, replace and remove them. */
/** `canEdit`: upload, replace and remove. `canReview`: verify, reject and reopen (also department coordinators). */
export function DocumentsPanel({ studentId, canEdit, canReview = canEdit }: { studentId: string; canEdit: boolean; canReview?: boolean }) {
  const { data, loading, reload } = useApi<Doc[]>(`/api/students/${studentId}/documents`)
  const [showHistory, setShowHistory] = React.useState(false)
  const history = useApi<Doc[]>(showHistory ? `/api/students/${studentId}/documents?history=1` : null)
  const [cat, setCat] = React.useState("")
  const [busy, setBusy] = React.useState<string | null>(null)
  const [rejecting, setRejecting] = React.useState<Doc | null>(null)
  const [reason, setReason] = React.useState("")
  const [deleting, setDeleting] = React.useState<Doc | null>(null)
  const [viewing, setViewing] = React.useState<number | null>(null)
  const replaceFor = React.useRef<Doc | null>(null)
  const picker = React.useRef<HTMLInputElement>(null)

  async function upload(file: File, category: string, replaces?: string) {
    const fd = new FormData()
    fd.set("file", file); fd.set("category", category)
    if (replaces) fd.set("replaces", replaces)
    await api(`/api/students/${studentId}/documents`, { method: "POST", body: fd })
  }
  async function onPick(file: File | undefined) {
    if (!file) return
    const old = replaceFor.current
    replaceFor.current = null
    const category = old?.category ?? cat
    if (!category) return toast.error("Choose a document category first")
    setBusy(old?.id ?? "new")
    try {
      // The server archives the old version in the same step. The old file is kept as history, never deleted.
      await upload(file, category, old?.id)
      toast.success(old ? "Document replaced. The earlier version is kept in history" : "Document uploaded")
      reload(); if (showHistory) history.reload()
    } catch (e) { toastError(e) } finally { setBusy(null) }
  }
  async function review(d: Doc, status: "VERIFIED" | "REJECTED" | "PENDING", rejectReason?: string) {
    setBusy(d.id)
    try {
      await api(`/api/students/${studentId}/documents/${d.id}`, { method: "PATCH", body: { status, ...(rejectReason ? { rejectReason } : {}) } })
      toast.success(status === "VERIFIED" ? "Document verified" : status === "REJECTED" ? "Document rejected" : "Document reopened")
      setRejecting(null); setReason(""); reload()
    } catch (e) { toastError(e) } finally { setBusy(null) }
  }
  async function remove() {
    if (!deleting) return
    setBusy(deleting.id)
    try { await api(`/api/students/${studentId}/documents/${deleting.id}`, { method: "DELETE" }); toast.success("Document removed"); setDeleting(null); reload() } catch (e) { toastError(e) } finally { setBusy(null) }
  }

  if (loading && !data) return <Skeleton className="h-40 rounded-xl" />
  return (
    <div className="flex flex-col gap-3">
      <input ref={picker} type="file" hidden accept="application/pdf,image/png,image/jpeg" onChange={(e) => { void onPick(e.target.files?.[0]); e.target.value = "" }} />
      {canEdit && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Field className="sm:w-64"><FieldLabel>Category</FieldLabel><OptionSelect className="w-full" value={cat} onChange={setCat} options={CATS} placeholder="Choose a category" /></Field>
          <Button disabled={busy === "new"} onClick={() => { replaceFor.current = null; if (!cat) return toast.error("Choose a document category first"); picker.current?.click() }}>{busy === "new" ? <Spinner /> : <PlusIcon />}Upload document</Button>
        </div>
      )}
      {data?.length === 0 && <p className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">No documents uploaded yet.</p>}
      {data?.map((d) => (
        <div key={d.id} className="flex flex-col gap-2 rounded-xl border p-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium">{catLabel(d.category)}</div>
              <div className="truncate text-muted-foreground">{d.fileName} · {(d.sizeBytes / 1024).toFixed(0)} KB · uploaded {fmtDate(d.createdAt)}</div>
              {d.status === "VERIFIED" && d.verifiedAt && <div className="text-xs text-muted-foreground">Verified by {d.verifiedBy?.name ?? "staff"} on {fmtDate(d.verifiedAt)}</div>}
              {d.status === "REJECTED" && d.rejectReason && <div className="text-xs text-destructive">Rejected: {d.rejectReason}</div>}
            </div>
            <Badge variant={docVariant(d.status)}>{titleCase(d.status)}</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {d.url && <Button variant="outline" size="sm" onClick={() => setViewing(data!.findIndex((x) => x.id === d.id))}><DownloadIcon />View</Button>}
            {canReview && <>
              {d.status !== "VERIFIED" && <Button size="sm" disabled={busy === d.id} onClick={() => review(d, "VERIFIED")}>Verify</Button>}
              {d.status !== "REJECTED" && <Button variant="outline" size="sm" disabled={busy === d.id} onClick={() => { setRejecting(d); setReason("") }}>Reject</Button>}
              {d.status !== "PENDING" && <Button variant="outline" size="sm" disabled={busy === d.id} onClick={() => review(d, "PENDING")}>Reopen</Button>}
            </>}
            {canEdit && <>
              <Button variant="outline" size="sm" disabled={busy === d.id} onClick={() => { replaceFor.current = d; picker.current?.click() }}>Replace</Button>
              {d.status !== "VERIFIED" && <Button variant="ghost" size="sm" disabled={busy === d.id} onClick={() => setDeleting(d)}><Trash2Icon />Remove</Button>}
            </>}
          </div>
          <DocumentReading docId={d.id} studentId={studentId} />
        </div>
      ))}
      <Dialog open={!!rejecting} onOpenChange={(o) => { if (!o) setRejecting(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject {rejecting ? catLabel(rejecting.category) : "document"}</DialogTitle></DialogHeader>
          <Field><FieldLabel htmlFor="why">Reason (shown to the student)</FieldLabel><Textarea id="why" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <DialogFooter><Button disabled={reason.trim().length < 3 || busy === rejecting?.id} onClick={() => rejecting && review(rejecting, "REJECTED", reason.trim())}>Reject document</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <DocumentViewer docs={(data ?? []).map((d) => ({ id: d.id, category: d.category, fileName: d.fileName, mimeType: d.mimeType, status: d.status, rejectReason: d.rejectReason, url: d.url }))} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} studentId={canReview ? studentId : undefined} onChanged={reload} />
      <ConfirmDelete open={!!deleting} what={deleting ? deleting.fileName : "this document"} busy={busy === deleting?.id} onConfirm={remove} onClose={() => setDeleting(null)} />
      <div className="flex flex-col gap-2">
        <div><Button variant="ghost" size="sm" onClick={() => setShowHistory((v) => !v)}>{showHistory ? "Hide" : "Show"} removed and replaced versions</Button></div>
        {showHistory && history.loading && !history.data && <Skeleton className="h-16 rounded-xl" />}
        {showHistory && history.data && history.data.filter((d) => d.archivedAt).length === 0 && <p className="text-sm text-muted-foreground">No earlier versions.</p>}
        {showHistory && history.data?.filter((d) => d.archivedAt).map((d) => (
          <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{catLabel(d.category)}</span>
            <span className="min-w-0 truncate">{d.fileName} · uploaded {fmtDate(d.createdAt)} · {d.archiveReason === "REPLACED" ? "replaced" : "removed"} {fmtDate(d.archivedAt!)}</span>
            <Badge variant={docVariant(d.status)}>{titleCase(d.status)}</Badge>
            {d.url && <a href={d.url} target="_blank" rel="noreferrer" className="ml-auto underline-offset-4 hover:underline">Open original</a>}
          </div>
        ))}
      </div>
    </div>
  )
}

type StaffSemester = { id: string; semesterNumber: number; sgpa: number | null; resultStatus: string; reviewStatus: string; percentage: number | null; subjects: { name: string; code: string | null; marksObtained: number | null; maxMarks: number | null; grade: string | null; credits: number | null; gradePoints: number | null }[]; pending: unknown }
type StaffBacklog = { id: string; subjectName: string; subjectCode: string | null; semesterNumber: number; status: string; attempts: { id: string; attemptNumber: number; examSession: string | null; outcome: string; clearedInSemester: number | null; reviewStatus: string }[] }

/** Semester results and backlog history as the student entered them, with each record's review state. They are reviewed with the Academics section. */
export function AcademicRecordsPanel({ studentId }: { studentId: string }) {
  const { data, loading } = useApi<{ semesters: StaffSemester[]; backlogs: StaffBacklog[] }>(`/api/students/${studentId}/academic-records`)
  if (loading && !data) return <Skeleton className="h-40 rounded-xl" />
  if (!data) return null
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">Semester results</h3>
      {data.semesters.length === 0 && <p className="rounded-xl border border-dashed py-6 text-center text-sm text-muted-foreground">No semester results entered.</p>}
      {data.semesters.map((m) => (
        <div key={m.id} className="flex flex-col gap-2 rounded-xl border p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2"><span className="font-medium">Semester {m.semesterNumber}</span>
            <Badge variant={m.pending ? "secondary" : statusVariant(m.reviewStatus)}>{m.pending ? "Revision pending" : titleCase(m.reviewStatus)}</Badge>
            <span className="text-muted-foreground">{[m.sgpa != null ? `SGPA ${m.sgpa}` : null, titleCase(m.resultStatus), m.percentage != null ? `${m.percentage}%` : null].filter(Boolean).join(" · ")}</span></div>
          {m.subjects.length > 0 && (
            <Table><TableHeader><TableRow><TableHead>Subject</TableHead><TableHead>Marks</TableHead><TableHead>Grade</TableHead><TableHead>Credits</TableHead></TableRow></TableHeader>
              <TableBody>{m.subjects.map((x) => <TableRow key={x.name + (x.code ?? "")}><TableCell>{x.name}{x.code ? ` (${x.code})` : ""}</TableCell><TableCell>{x.marksObtained}/{x.maxMarks}</TableCell><TableCell>{x.grade ?? "—"}{x.gradePoints != null ? ` · ${x.gradePoints}` : ""}</TableCell><TableCell>{x.credits ?? "—"}</TableCell></TableRow>)}</TableBody></Table>
          )}
        </div>
      ))}
      <h3 className="pt-2 text-sm font-medium">Backlog history</h3>
      {data.backlogs.length === 0 && <p className="rounded-xl border border-dashed py-6 text-center text-sm text-muted-foreground">No backlogs listed.</p>}
      {data.backlogs.map((b) => (
        <div key={b.id} className="flex flex-col gap-1 rounded-xl border p-3 text-sm">
          <div className="font-medium">{b.subjectName}{b.subjectCode ? ` (${b.subjectCode})` : ""} <span className="font-normal text-muted-foreground">· semester {b.semesterNumber}</span> <Badge variant={b.status === "CLEARED" ? "default" : "destructive"}>{titleCase(b.status)}</Badge></div>
          <ol className="text-xs text-muted-foreground">{b.attempts.map((a) => <li key={a.id}>Attempt {a.attemptNumber}{a.examSession ? ` (${a.examSession})` : ""}: {a.outcome === "CLEARED" ? `cleared in semester ${a.clearedInSemester}` : "not cleared"} <Badge variant={statusVariant(a.reviewStatus)}>{titleCase(a.reviewStatus)}</Badge></li>)}</ol>
        </div>
      ))}
    </div>
  )
}
