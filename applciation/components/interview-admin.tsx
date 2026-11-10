"use client"

import * as React from "react"
import { toast } from "sonner"

import { ReportButtons } from "@/components/report-buttons"
import { InterviewReport, type Report } from "@/components/interview-report"
import { OptionSelect } from "@/components/option-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { DIFFICULTIES, DURATIONS, INTERVIEW_TYPES, LANGUAGES, TYPE_LABEL, type InterviewType } from "@/lib/interviewEngine"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, fmtDateTime, titleCase } from "@/lib/web/format"
import { useLookups } from "@/lib/web/lookups"
import { useApi } from "@/lib/web/use-api"

type Assignment = { id: string; title: string; type: InterviewType; mode: string; difficulty: string; durationMin: number; language: string; role: string; topic: string; dueAt: string | null; started: number; completed: number }
type Detail = { assignment: Assignment; completed: number; averageScore: number | null; interviews: { id: string; student: { name: string; enrollmentNo: string }; status: string; startedAt: string; score: number | null; weak: string[]; voiceUsed: boolean }[] }
type Full = { student: { name: string; enrollmentNo: string }; title: string; transcript: { role: string; text: string; kind?: string; voice?: boolean }[]; feedback: Report | null; comparison: Parameters<typeof InterviewReport>[0]["comparison"]; startedAt: string }
const opt = (xs: readonly (string | number)[], label: (x: string) => string = (x) => x) => xs.map((x) => ({ value: String(x), label: label(String(x)) }))

/** Interviews set up for students (staff side of the mock interview engine). Only assigned interviews are visible here; a student's own practice is private. */
export function InterviewAdmin() {
  const list = useApi<Assignment[]>("/api/interviews/assignments")
  const [make, setMake] = React.useState(false)
  const [openId, setOpenId] = React.useState<string | null>(null)
  if (openId) return <AssignmentDetail id={openId} onBack={() => setOpenId(null)} />
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Set up an AI interview for a department or batch. Students are told you will see their report. Interviews students start on their own stay private.</p>
      <div><Button onClick={() => setMake(true)}>Set up an interview</Button></div>
      {!list.data ? <Skeleton className="h-24" /> : list.data.length === 0 ? <p className="text-sm text-muted-foreground">No interviews set up yet.</p> : list.data.map((a) => (
        <Card key={a.id} size="sm"><CardContent className="flex flex-wrap items-center gap-2 text-sm">
          <div className="min-w-0 flex-1"><div className="font-medium">{a.title}</div><div className="text-xs text-muted-foreground">{TYPE_LABEL[a.type]} · {titleCase(a.mode)} mode · {titleCase(a.difficulty)} · {a.durationMin} min · {a.language}{a.dueAt ? ` · by ${fmtDate(a.dueAt)}` : ""}</div></div>
          <Badge variant="secondary">{a.completed} finished of {a.started} started</Badge><Button size="sm" variant="outline" onClick={() => setOpenId(a.id)}>Reports</Button>
        </CardContent></Card>
      ))}
      <Make open={make} onClose={() => setMake(false)} onDone={list.reload} />
    </div>
  )
}

function Make({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const lk = useLookups()
  const jds = useApi<{ id: string; title: string; companyName: string }[]>(open ? "/api/jds" : null, { status: "APPROVED" })
  const [f, setF] = React.useState({ title: "", type: "TECHNICAL", mode: "LEARNING", difficulty: "MEDIUM", durationMin: "20", language: "English", role: "", topic: "", jdId: "", dueAt: "", departmentId: "", batchId: "" })
  const [busy, setBusy] = React.useState(false)
  const set = (p: Partial<typeof f>) => setF((o) => ({ ...o, ...p }))
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    try {
      await api("/api/interviews/assignments", { method: "POST", body: { title: f.title, type: f.type, mode: f.mode, difficulty: f.difficulty, durationMin: Number(f.durationMin), language: f.language, role: f.role, topic: f.topic, ...(f.jdId ? { jdId: f.jdId } : {}), ...(f.dueAt ? { dueAt: new Date(`${f.dueAt}T23:59`).toISOString() } : {}), targetDepartmentIds: f.departmentId ? [f.departmentId] : [], targetBatchIds: f.batchId ? [f.batchId] : [] } })
      toast.success("Interview set up and students told"); onDone(); onClose()
    } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Set up an interview</DialogTitle><DialogDescription>Students can take it more than once. Assessment mode is timed and gives no hints; learning mode coaches them as they go.</DialogDescription></DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-4"><FieldGroup>
          <Field><FieldLabel htmlFor="ia-t">Name</FieldLabel><Input id="ia-t" required minLength={3} value={f.title} onChange={(e) => set({ title: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field><FieldLabel>Kind</FieldLabel><OptionSelect className="w-full" value={f.type} onChange={(v) => set({ type: v })} options={INTERVIEW_TYPES.map(([value, label]) => ({ value, label }))} placeholder="Kind" /></Field>
            <Field><FieldLabel>Mode</FieldLabel><OptionSelect className="w-full" value={f.mode} onChange={(v) => set({ mode: v })} options={[{ value: "LEARNING", label: "Learning" }, { value: "ASSESSMENT", label: "Assessment (timed, no hints)" }]} placeholder="Mode" /></Field>
            <Field><FieldLabel>Difficulty</FieldLabel><OptionSelect className="w-full" value={f.difficulty} onChange={(v) => set({ difficulty: v })} options={opt(DIFFICULTIES, titleCase)} placeholder="Difficulty" /></Field>
            <Field><FieldLabel>Length</FieldLabel><OptionSelect className="w-full" value={f.durationMin} onChange={(v) => set({ durationMin: v })} options={opt(DURATIONS, (x) => `${x} minutes`)} placeholder="Length" /></Field>
            <Field><FieldLabel>Language</FieldLabel><OptionSelect className="w-full" value={f.language} onChange={(v) => set({ language: v })} options={opt(LANGUAGES)} placeholder="Language" /></Field>
            <Field><FieldLabel htmlFor="ia-d">Last day to take it (optional)</FieldLabel><Input id="ia-d" type="date" value={f.dueAt} onChange={(e) => set({ dueAt: e.target.value })} /></Field>
          </div>
          <Field><FieldLabel htmlFor="ia-r">Job role</FieldLabel><Input id="ia-r" required minLength={2} value={f.role} onChange={(e) => set({ role: e.target.value })} /></Field>
          <Field><FieldLabel htmlFor="ia-p">Topic</FieldLabel><Input id="ia-p" required minLength={2} value={f.topic} onChange={(e) => set({ topic: e.target.value })} /></Field>
          <Field><FieldLabel>Related job description (the interviewer will ask what that job tests)</FieldLabel><OptionSelect className="w-full" value={f.jdId} onChange={(v) => set({ jdId: v })} options={[{ value: "", label: "None" }, ...(jds.data ?? []).map((j) => ({ value: j.id, label: `${j.title} (${j.companyName})` }))]} placeholder="None" /></Field>
          <div className="grid gap-3 sm:grid-cols-2"><Field><FieldLabel>Department (optional)</FieldLabel><OptionSelect className="w-full" value={f.departmentId} onChange={(v) => set({ departmentId: v })} options={[{ value: "", label: "All" }, ...lk.departments]} placeholder="All" /></Field><Field><FieldLabel>Batch (optional)</FieldLabel><OptionSelect className="w-full" value={f.batchId} onChange={(v) => set({ batchId: v })} options={[{ value: "", label: "All" }, ...lk.batches]} placeholder="All" /></Field></div>
        </FieldGroup><DialogFooter><Button type="submit" disabled={busy}>{busy && <Spinner />}Set up and tell students</Button></DialogFooter></form>
      </DialogContent>
    </Dialog>
  )
}

function AssignmentDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data } = useApi<Detail>(`/api/interviews/assignments/${id}`)
  const [view, setView] = React.useState<string | null>(null)
  if (view) return <One id={view} onBack={() => setView(null)} />
  if (!data) return <Skeleton className="h-40" />
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2"><Button size="sm" variant="outline" onClick={onBack}>Back</Button><span className="font-medium">{data.assignment.title}</span>{data.averageScore !== null && <Badge variant="secondary">Average {data.averageScore}/10 over {data.completed}</Badge>}</div>
      {data.interviews.length === 0 && <p className="text-sm text-muted-foreground">No student has started this yet.</p>}
      {data.interviews.map((i) => (
        <Card key={i.id} size="sm"><CardContent className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{i.student.name}</span><span className="text-muted-foreground">{i.student.enrollmentNo} · {fmtDateTime(i.startedAt)}</span>
          <Badge variant={i.status === "COMPLETED" ? "default" : "outline"}>{titleCase(i.status)}</Badge>{i.score !== null && <Badge>{i.score}/10</Badge>}{i.voiceUsed && <Badge variant="outline">Voice dictation</Badge>}
          {i.weak.length > 0 && <span className="text-xs text-muted-foreground">Weakest: {i.weak.join(", ")}</span>}
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setView(i.id)}>Open</Button>
        </CardContent></Card>
      ))}
    </div>
  )
}

function One({ id, onBack }: { id: string; onBack: () => void }) {
  const { data } = useApi<Full>(`/api/interviews/${id}`)
  if (!data) return <Skeleton className="h-40" />
  return (
    <div className="flex max-w-3xl flex-col gap-3">
      <div className="flex items-center gap-2"><Button size="sm" variant="outline" onClick={onBack}>Back</Button><span className="font-medium">{data.student.name}</span><span className="text-sm text-muted-foreground">{data.title}</span><span className="ml-auto"><ReportButtons path={`/api/reports/documents/interview/${id}`} label="Download report" /></span></div>
      <Card size="sm"><CardHeader><CardTitle className="text-sm">Transcript</CardTitle><CardDescription>The student&apos;s own words are marked &quot;Student&quot;. Everything else was written by the AI.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-2">{data.transcript.map((t, i) => <div key={i} className={`rounded-md border p-3 text-sm ${t.role === "student" ? "" : "bg-muted"}`}><div className="pb-1 text-xs text-muted-foreground">{t.role === "interviewer" ? "Interviewer (AI)" : t.role === "coach" ? "Coach (AI)" : `Student${t.voice ? " (spoken, as text)" : ""}`}</div><p className="whitespace-pre-wrap">{t.text}</p></div>)}</CardContent></Card>
      {data.feedback ? <InterviewReport feedback={data.feedback} comparison={data.comparison} /> : <p className="text-sm text-muted-foreground">No report yet.</p>}
    </div>
  )
}
