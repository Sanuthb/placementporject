"use client"

import * as React from "react"
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { EducationStep } from "@/components/onboarding/education"
import { Text } from "@/components/onboarding/fields"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { api, toastError } from "@/lib/web/api"
import { statusVariant, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Subject = { code: string | null; name: string; marksObtained: number | null; maxMarks: number | null; credits: number | null; grade: string | null; gradePoints: number | null }
type Pending = { sgpa: number | null; resultStatus: string; subjects: Subject[] }
export type Semester = { id: string; semesterNumber: number; sgpa: number | null; resultStatus: string; reviewStatus: string; reviewComment: string | null; percentage: number | null; subjects: Subject[]; pending: Pending | null }
type Attempt = { id: string; attemptNumber: number; examSession: string | null; marksObtained: number | null; outcome: string; clearedInSemester: number | null; reviewStatus: string; reviewComment: string | null }
export type Backlog = { id: string; subjectName: string; subjectCode: string | null; semesterNumber: number; status: string; attempts: Attempt[] }

const num = (v: string) => (v.trim() === "" ? null : Number(v))
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v))
const RESULTS = ["PASS", "FAIL", "WITHHELD", "ONGOING"].map((v) => ({ value: v, label: titleCase(v) }))

function StateBadge({ status, pending }: { status: string; pending?: boolean }) {
  if (pending) return <Badge variant="secondary">Revision pending</Badge>
  if (status === "DRAFT") return <Badge variant="outline">Draft</Badge>
  return <Badge variant={statusVariant(status)}>{titleCase(status)}</Badge>
}

/** What the marks add up to, worked out on screen the same way the server does. */
const percentOf = (subjects: { marksObtained: string; maxMarks: string }[]) => {
  const max = subjects.reduce((t, s) => t + (Number(s.maxMarks) || 0), 0)
  return max > 0 ? Math.round((subjects.reduce((t, s) => t + (Number(s.marksObtained) || 0), 0) / max) * 10000) / 100 : null
}

// ------------------------------------------------------------------------------------------------ semester results

export function SemesterResultsPanel({ locked }: { locked: boolean }) {
  const { data, loading, reload } = useApi<Semester[]>("/api/student/semesters")
  const [editing, setEditing] = React.useState<Semester | "new" | null>(null)
  async function remove(s: Semester) {
    try { await api(`/api/student/semesters/${s.id}`, { method: "DELETE" }); toast.success("Removed"); reload() } catch (e) { toastError(e) }
  }
  if (loading && !data) return <Skeleton className="h-32" />
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-medium">Semester results</h3>
        <p className="text-sm text-muted-foreground">Add each semester with its subjects and marks. The percentage is worked out from the marks. Staff check these against your marksheets when you submit this section.</p>
      </div>
      {data?.length === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No semesters added yet.</p>}
      {data?.map((s) => {
        const shown = s.pending ? { ...s, ...s.pending } : s
        return (
          <div key={s.id} className="flex flex-wrap items-start gap-3 rounded-lg border p-3 text-sm">
            <div className="min-w-0 flex-1">
              <div className="font-medium">Semester {s.semesterNumber} <StateBadge status={s.reviewStatus} pending={!!s.pending} /></div>
              <div className="text-muted-foreground">{[shown.sgpa != null ? `SGPA ${shown.sgpa}` : null, titleCase(shown.resultStatus), shown.subjects.length ? `${shown.subjects.length} subject${shown.subjects.length > 1 ? "s" : ""}` : null, percentOf(shown.subjects.map((x) => ({ marksObtained: str(x.marksObtained), maxMarks: str(x.maxMarks) }))) != null ? `${percentOf(shown.subjects.map((x) => ({ marksObtained: str(x.marksObtained), maxMarks: str(x.maxMarks) })))}%` : null].filter(Boolean).join(" · ")}</div>
              {shown.subjects.length > 0 && <ul className="mt-1 text-xs text-muted-foreground">{shown.subjects.map((x) => <li key={x.name + (x.code ?? "")}>{x.name}{x.code ? ` (${x.code})` : ""}: {x.marksObtained}/{x.maxMarks}{x.grade ? ` · ${x.grade}` : ""}</li>)}</ul>}
              {s.reviewComment && (s.reviewStatus === "CHANGES_REQUESTED" || s.pending) && <p className="mt-1 text-xs text-destructive">{s.reviewComment}</p>}
            </div>
            {!locked && (
              <div className="flex gap-1">
                <Button size="icon-sm" variant="ghost" aria-label={`Edit semester ${s.semesterNumber}`} onClick={() => setEditing(s)}><PencilIcon /></Button>
                {s.reviewStatus !== "VERIFIED" && s.reviewStatus !== "SUBMITTED" && <Button size="icon-sm" variant="ghost" aria-label={`Remove semester ${s.semesterNumber}`} onClick={() => remove(s)}><Trash2Icon /></Button>}
              </div>
            )}
          </div>
        )
      })}
      {!locked && <div><Button type="button" variant="outline" onClick={() => setEditing("new")}><PlusIcon />Add semester</Button></div>}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null) }}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editing === "new" ? "Add semester" : "Edit semester"}</DialogTitle><DialogDescription>{editing !== "new" && editing?.reviewStatus === "VERIFIED" ? "This semester is verified. Your change is sent to staff as a revision and the verified result stays until they approve it." : "Enter the subjects and marks from your marksheet."}</DialogDescription></DialogHeader>
          {editing && <SemesterForm key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? null : editing} onDone={() => { setEditing(null); reload() }} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

type Row = { code: string; name: string; marksObtained: string; maxMarks: string; credits: string; grade: string; gradePoints: string }
const blankRow: Row = { code: "", name: "", marksObtained: "", maxMarks: "100", credits: "", grade: "", gradePoints: "" }

function SemesterForm({ initial, onDone }: { initial: Semester | null; onDone: () => void }) {
  const src = initial ? { ...initial, ...(initial.pending ?? {}) } : null
  const [number, setNumber] = React.useState(str(initial?.semesterNumber))
  const [sgpa, setSgpa] = React.useState(str(src?.sgpa))
  const [result, setResult] = React.useState(src?.resultStatus ?? "PASS")
  const [rows, setRows] = React.useState<Row[]>(() => (src?.subjects ?? []).map((s) => ({ code: str(s.code), name: s.name, marksObtained: str(s.marksObtained), maxMarks: str(s.maxMarks), credits: str(s.credits), grade: str(s.grade), gradePoints: str(s.gradePoints) })))
  const [busy, setBusy] = React.useState(false)
  const setRow = (i: number, k: keyof Row, v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  const pct = percentOf(rows)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const n = num(number)
    if (n === null || !Number.isInteger(n) || n < 1 || n > 12) return void toast.error("Semester number must be between 1 and 12")
    const bad = rows.find((r) => r.name.trim() && num(r.marksObtained) !== null && num(r.maxMarks) !== null && Number(r.marksObtained) > Number(r.maxMarks))
    if (bad) return void toast.error(`${bad.name}: marks obtained cannot exceed the maximum marks`)
    setBusy(true)
    try {
      const subjects = rows.filter((r) => r.name.trim()).map((r) => ({ name: r.name.trim(), code: r.code.trim() || null, marksObtained: num(r.marksObtained) ?? 0, maxMarks: num(r.maxMarks) ?? 0, credits: num(r.credits), grade: r.grade.trim() || null, gradePoints: num(r.gradePoints) }))
      await api("/api/student/semesters", { method: "PUT", body: { semesterNumber: n, sgpa: num(sgpa), resultStatus: result, subjects } })
      toast.success("Saved"); onDone()
    } catch (x) { toastError(x) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={save}>
      <FieldGroup>
        <div className="grid grid-cols-2 gap-3">
          <Text id="sem-no" label="Semester" type="number" value={number} onChange={setNumber} required disabled={!!initial} hint={initial ? undefined : "1 to 12"} />
          <Text id="sem-sgpa" label="SGPA (0 to 10)" type="number" value={sgpa} onChange={setSgpa} hint="Optional if you enter credits and grade points" />
        </div>
        <Field><FieldLabel>Result</FieldLabel><OptionSelect className="w-full" value={result} onChange={setResult} options={RESULTS} placeholder="Result" /></Field>
        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-medium">Subjects{pct != null ? <span className="ml-2 font-normal text-muted-foreground">Total {pct}%</span> : null}</h4>
          {rows.map((r, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-md border p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <Text id={`s-${i}-n`} label="Subject" value={r.name} onChange={(v) => setRow(i, "name", v)} />
                <Text id={`s-${i}-c`} label="Code" value={r.code} onChange={(v) => setRow(i, "code", v)} />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Text id={`s-${i}-o`} label="Marks obtained" type="number" value={r.marksObtained} onChange={(v) => setRow(i, "marksObtained", v)} />
                <Text id={`s-${i}-m`} label="Maximum marks" type="number" value={r.maxMarks} onChange={(v) => setRow(i, "maxMarks", v)} />
                <Text id={`s-${i}-cr`} label="Credits" type="number" value={r.credits} onChange={(v) => setRow(i, "credits", v)} />
                <Text id={`s-${i}-gp`} label="Grade points" type="number" value={r.gradePoints} onChange={(v) => setRow(i, "gradePoints", v)} />
              </div>
              <div className="flex items-end justify-between gap-2">
                <Text id={`s-${i}-g`} label="Grade" value={r.grade} onChange={(v) => setRow(i, "grade", v)} />
                <Button type="button" size="sm" variant="ghost" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}><Trash2Icon />Remove</Button>
              </div>
            </div>
          ))}
          <div><Button type="button" variant="outline" onClick={() => setRows((r) => [...r, { ...blankRow }])}><PlusIcon />Add subject</Button></div>
        </div>
        <Button type="submit" disabled={busy}>{busy && <Spinner />}Save semester</Button>
      </FieldGroup>
    </form>
  )
}

// ----------------------------------------------------------------------------------------------------- backlogs

export function BacklogsPanel({ locked }: { locked: boolean }) {
  const { data, loading, reload } = useApi<Backlog[]>("/api/student/backlogs")
  const [adding, setAdding] = React.useState(false)
  const [attemptFor, setAttemptFor] = React.useState<Backlog | null>(null)
  async function remove(b: Backlog) {
    try { await api(`/api/student/backlogs/${b.id}`, { method: "DELETE" }); toast.success("Removed"); reload() } catch (e) { toastError(e) }
  }
  if (loading && !data) return <Skeleton className="h-32" />
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-medium">Backlog history</h3>
        <p className="text-sm text-muted-foreground">List any subject you failed. Each time you attempt it again, add an attempt: earlier attempts stay on record, even after you clear it.</p>
      </div>
      {data?.length === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No backlogs listed.</p>}
      {data?.map((b) => {
        const kept = b.attempts.some((a) => a.reviewStatus === "VERIFIED" || a.reviewStatus === "SUBMITTED")
        return (
          <div key={b.id} className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="font-medium">{b.subjectName}{b.subjectCode ? ` (${b.subjectCode})` : ""} <span className="font-normal text-muted-foreground">· semester {b.semesterNumber}</span> <Badge variant={b.status === "CLEARED" ? "default" : "destructive"}>{titleCase(b.status)}</Badge></div>
              {!locked && (
                <div className="flex gap-1">
                  {b.status === "PENDING" && <Button size="sm" variant="outline" onClick={() => setAttemptFor(b)}><PlusIcon />Add attempt</Button>}
                  {!kept && <Button size="icon-sm" variant="ghost" aria-label={`Remove ${b.subjectName}`} onClick={() => remove(b)}><Trash2Icon /></Button>}
                </div>
              )}
            </div>
            <ol className="flex flex-col gap-0.5 text-xs text-muted-foreground">
              {b.attempts.map((a) => (
                <li key={a.id}>Attempt {a.attemptNumber}{a.examSession ? ` (${a.examSession})` : ""}: {a.outcome === "CLEARED" ? `cleared in semester ${a.clearedInSemester}` : "not cleared"}{a.marksObtained != null ? ` · ${a.marksObtained} marks` : ""} <StateBadge status={a.reviewStatus} />{a.reviewComment && a.reviewStatus === "CHANGES_REQUESTED" ? <span className="text-destructive"> {a.reviewComment}</span> : null}</li>
              ))}
            </ol>
          </div>
        )
      })}
      {!locked && <div><Button type="button" variant="outline" onClick={() => setAdding(true)}><PlusIcon />Add backlog subject</Button></div>}
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="max-h-[90svh] overflow-y-auto"><DialogHeader><DialogTitle>Add backlog subject</DialogTitle><DialogDescription>The subject you failed and when.</DialogDescription></DialogHeader>
          {adding && <BacklogForm onDone={() => { setAdding(false); reload() }} />}
        </DialogContent>
      </Dialog>
      <Dialog open={!!attemptFor} onOpenChange={(o) => { if (!o) setAttemptFor(null) }}>
        <DialogContent className="max-h-[90svh] overflow-y-auto"><DialogHeader><DialogTitle>Add attempt: {attemptFor?.subjectName}</DialogTitle><DialogDescription>Earlier attempts are kept. If you cleared the subject, say in which semester.</DialogDescription></DialogHeader>
          {attemptFor && <AttemptForm backlog={attemptFor} onDone={() => { setAttemptFor(null); reload() }} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function BacklogForm({ onDone }: { onDone: () => void }) {
  const [v, setV] = React.useState({ subjectName: "", subjectCode: "", semesterNumber: "", examSession: "" })
  const [busy, setBusy] = React.useState(false)
  const set = (k: keyof typeof v, x: string) => setV((s) => ({ ...s, [k]: x }))
  async function save(e: React.FormEvent) {
    e.preventDefault()
    const n = num(v.semesterNumber)
    if (n === null || n < 1 || n > 12) return void toast.error("Semester must be between 1 and 12")
    setBusy(true)
    try { await api("/api/student/backlogs", { method: "POST", body: { subjectName: v.subjectName.trim(), subjectCode: v.subjectCode.trim() || null, semesterNumber: n, examSession: v.examSession.trim() || null } }); toast.success("Added"); onDone() } catch (x) { toastError(x) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={save}>
      <FieldGroup>
        <Text id="b-n" label="Subject" value={v.subjectName} onChange={(x) => set("subjectName", x)} required />
        <div className="grid grid-cols-2 gap-3">
          <Text id="b-c" label="Code" value={v.subjectCode} onChange={(x) => set("subjectCode", x)} />
          <Text id="b-s" label="Failed in semester" type="number" value={v.semesterNumber} onChange={(x) => set("semesterNumber", x)} required />
        </div>
        <Text id="b-e" label="Exam session" value={v.examSession} onChange={(x) => set("examSession", x)} hint="For example Nov 2024" />
        <Button type="submit" disabled={busy}>{busy && <Spinner />}Add</Button>
      </FieldGroup>
    </form>
  )
}

function AttemptForm({ backlog, onDone }: { backlog: Backlog; onDone: () => void }) {
  const [v, setV] = React.useState({ outcome: "FAILED", examSession: "", clearedInSemester: "", marksObtained: "" })
  const [busy, setBusy] = React.useState(false)
  const set = (k: keyof typeof v, x: string) => setV((s) => ({ ...s, [k]: x }))
  async function save(e: React.FormEvent) {
    e.preventDefault()
    const c = num(v.clearedInSemester)
    if (v.outcome === "CLEARED" && (c === null || c < backlog.semesterNumber)) return void toast.error(`Say in which semester it was cleared (semester ${backlog.semesterNumber} or later)`)
    setBusy(true)
    try { await api(`/api/student/backlogs/${backlog.id}/attempts`, { method: "POST", body: { outcome: v.outcome, examSession: v.examSession.trim() || null, clearedInSemester: v.outcome === "CLEARED" ? c : null, marksObtained: num(v.marksObtained) } }); toast.success("Attempt added"); onDone() } catch (x) { toastError(x) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={save}>
      <FieldGroup>
        <Field><FieldLabel>Result of this attempt</FieldLabel><OptionSelect className="w-full" value={v.outcome} onChange={(x) => set("outcome", x)} options={[{ value: "FAILED", label: "Not cleared" }, { value: "CLEARED", label: "Cleared" }]} placeholder="Result" /></Field>
        {v.outcome === "CLEARED" && <Text id="a-c" label="Cleared in semester" type="number" value={v.clearedInSemester} onChange={(x) => set("clearedInSemester", x)} required />}
        <div className="grid grid-cols-2 gap-3">
          <Text id="a-e" label="Exam session" value={v.examSession} onChange={(x) => set("examSession", x)} />
          <Text id="a-m" label="Marks" type="number" value={v.marksObtained} onChange={(x) => set("marksObtained", x)} />
        </div>
        <Button type="submit" disabled={busy}>{busy && <Spinner />}Add attempt</Button>
      </FieldGroup>
    </form>
  )
}

/** Shown on the academics page so a student knows what happens to what they entered here. */
export function RecordsNote() {
  return <Alert><AlertDescription>Semester results and backlogs are submitted for review together with this section, using the button below.</AlertDescription></Alert>
}

// -------------------------------------------------------------------------------------------- qualifications

/** The student's qualifications with their review state, using the same list and form as the onboarding wizard. */
export function EducationRecordsPanel({ locked }: { locked: boolean }) {
  const { data, loading, reload } = useApi<EduRow[]>("/api/student/education")
  if (loading && !data) return <Skeleton className="h-32" />
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">Qualifications</h3>
      <EducationStep items={data ?? []} editable={!locked} onChanged={reload} showStatus />
    </div>
  )
}
type EduRow = React.ComponentProps<typeof EducationStep>["items"][number]
