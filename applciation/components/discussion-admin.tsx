"use client"

import * as React from "react"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { ReportButtons } from "@/components/report-buttons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { DIFFICULTIES, DURATIONS, KINDS, KIND_LABEL, LANGUAGES, suggestTopics, type Kind } from "@/lib/discussionEngine"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, fmtDateTime, titleCase } from "@/lib/web/format"
import { useLookups } from "@/lib/web/lookups"
import { useApi } from "@/lib/web/use-api"

type Assignment = { id: string; title: string; kind: Kind; topic: string; difficulty: string; language: string; durationMin: number; dueAt: string | null; started: number; completed: number }
type Detail = { assignment: Assignment; completed: number; averageScore: number | null; sessions: { id: string; student: { name: string; enrollmentNo: string }; status: string; startedAt: string; score: number | null; weak: string[]; voiceUsed: boolean }[] }
type Full = { student: { name: string }; title: string; transcript: { role: string; speaker: string; text: string; voice?: boolean }[]; evaluation: { score: number; summary: string; categories: { key: string; label: string; score: number; comment: string }[]; strengths: string[]; improvements: string[] } | null }
const opt = (xs: readonly (string | number)[], label: (x: string) => string = (x) => x) => xs.map((x) => ({ value: String(x), label: label(String(x)) }))

/** Discussion sessions set up for students (staff side). Only assigned sessions are visible here; a student's own practice is private. */
export function DiscussionAdmin() {
  const list = useApi<Assignment[]>("/api/discussions/assignments")
  const [make, setMake] = React.useState(false)
  const [openId, setOpenId] = React.useState<string | null>(null)
  if (openId) return <AssignmentDetail id={openId} onBack={() => setOpenId(null)} />
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Set up a group discussion, debate or presentation practice for a department or batch. Students are told you will see their report. Sessions students start on their own stay private.</p>
      <div><Button onClick={() => setMake(true)}>Set up a session</Button></div>
      {!list.data ? <Skeleton className="h-24" /> : list.data.length === 0 ? <p className="text-sm text-muted-foreground">Nothing set up yet.</p> : list.data.map((a) => (
        <Card key={a.id} size="sm"><CardContent className="flex flex-wrap items-center gap-2 text-sm">
          <div className="min-w-0 flex-1"><div className="font-medium">{a.title}</div><div className="text-xs text-muted-foreground">{KIND_LABEL[a.kind]} · {a.topic} · {a.durationMin} min · {a.language}{a.dueAt ? ` · by ${fmtDate(a.dueAt)}` : ""}</div></div>
          <Badge variant="secondary">{a.completed} finished of {a.started} started</Badge><Button size="sm" variant="outline" onClick={() => setOpenId(a.id)}>Reports</Button>
        </CardContent></Card>
      ))}
      <Make open={make} onClose={() => setMake(false)} onDone={list.reload} />
    </div>
  )
}

function Make({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const lk = useLookups()
  const [f, setF] = React.useState({ title: "", kind: "GD", topic: "", difficulty: "MEDIUM", language: "English", durationMin: "10", dueAt: "", departmentId: "", batchId: "" })
  const [busy, setBusy] = React.useState(false)
  const set = (p: Partial<typeof f>) => setF((o) => ({ ...o, ...p }))
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    try {
      await api("/api/discussions/assignments", { method: "POST", body: { title: f.title, kind: f.kind, topic: f.topic, difficulty: f.difficulty, language: f.language, durationMin: Number(f.durationMin), ...(f.dueAt ? { dueAt: new Date(`${f.dueAt}T23:59`).toISOString() } : {}), targetDepartmentIds: f.departmentId ? [f.departmentId] : [], targetBatchIds: f.batchId ? [f.batchId] : [] } })
      toast.success("Session set up and students told"); onDone(); onClose()
    } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Set up a session</DialogTitle><DialogDescription>Students can take it more than once. The AI plays the other participants.</DialogDescription></DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-4"><FieldGroup>
          <Field><FieldLabel htmlFor="da-t">Name</FieldLabel><Input id="da-t" required minLength={3} value={f.title} onChange={(e) => set({ title: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field><FieldLabel>Kind</FieldLabel><OptionSelect className="w-full" value={f.kind} onChange={(v) => set({ kind: v, topic: "" })} options={KINDS.map(([value, label]) => ({ value, label }))} placeholder="Kind" /></Field>
            <Field><FieldLabel>Length</FieldLabel><OptionSelect className="w-full" value={f.durationMin} onChange={(v) => set({ durationMin: v })} options={opt(DURATIONS, (x) => `${x} minutes`)} placeholder="Length" /></Field>
            <Field><FieldLabel>Difficulty</FieldLabel><OptionSelect className="w-full" value={f.difficulty} onChange={(v) => set({ difficulty: v })} options={opt(DIFFICULTIES, titleCase)} placeholder="Difficulty" /></Field>
            <Field><FieldLabel>Language</FieldLabel><OptionSelect className="w-full" value={f.language} onChange={(v) => set({ language: v })} options={opt(LANGUAGES)} placeholder="Language" /></Field>
          </div>
          <Field><FieldLabel>Topic</FieldLabel><div className="flex flex-col gap-1">{suggestTopics(f.kind as Kind, null, 4).map((t) => <button key={t} type="button" onClick={() => set({ topic: t })} className={`rounded-md border p-2 text-left text-sm hover:bg-muted ${f.topic === t ? "border-primary" : ""}`}>{t}</button>)}</div><Input aria-label="Topic" required minLength={8} placeholder="Or write your own" value={f.topic} onChange={(e) => set({ topic: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field><FieldLabel htmlFor="da-d">Last day (optional)</FieldLabel><Input id="da-d" type="date" value={f.dueAt} onChange={(e) => set({ dueAt: e.target.value })} /></Field>
            <Field><FieldLabel>Department</FieldLabel><OptionSelect className="w-full" value={f.departmentId} onChange={(v) => set({ departmentId: v })} options={[{ value: "", label: "All" }, ...lk.departments]} placeholder="All" /></Field>
            <Field><FieldLabel>Batch</FieldLabel><OptionSelect className="w-full" value={f.batchId} onChange={(v) => set({ batchId: v })} options={[{ value: "", label: "All" }, ...lk.batches]} placeholder="All" /></Field>
          </div>
        </FieldGroup><DialogFooter><Button type="submit" disabled={busy}>{busy && <Spinner />}Set up and tell students</Button></DialogFooter></form>
      </DialogContent>
    </Dialog>
  )
}

function AssignmentDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data } = useApi<Detail>(`/api/discussions/assignments/${id}`)
  const [view, setView] = React.useState<string | null>(null)
  if (view) return <One id={view} onBack={() => setView(null)} />
  if (!data) return <Skeleton className="h-40" />
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2"><Button size="sm" variant="outline" onClick={onBack}>Back</Button><span className="font-medium">{data.assignment.title}</span>{data.averageScore !== null && <Badge variant="secondary">Average {data.averageScore}/10 over {data.completed}</Badge>}</div>
      {data.sessions.length === 0 && <p className="text-sm text-muted-foreground">No student has started this yet.</p>}
      {data.sessions.map((i) => (
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
  const { data } = useApi<Full>(`/api/discussions/${id}`)
  if (!data) return <Skeleton className="h-40" />
  return (
    <div className="flex max-w-3xl flex-col gap-3">
      <div className="flex items-center gap-2"><Button size="sm" variant="outline" onClick={onBack}>Back</Button><span className="font-medium">{data.student.name}</span><span className="text-sm text-muted-foreground">{data.title}</span><span className="ml-auto"><ReportButtons path={`/api/reports/documents/discussion/${id}`} label="Download report" /></span></div>
      <Card size="sm"><CardHeader><CardTitle className="text-sm">Transcript</CardTitle><CardDescription>The student&apos;s own words are marked &quot;Student&quot;. Everything else was written by the AI.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-2">{data.transcript.map((t, i) => <div key={i} className={`rounded-md border p-3 text-sm ${t.role === "student" ? "" : "bg-muted"}`}><div className="pb-1 text-xs text-muted-foreground">{t.role === "student" ? `Student${t.voice ? " (spoken, as text)" : ""}` : `${t.speaker} (AI)`}</div><p className="whitespace-pre-wrap">{t.text}</p></div>)}</CardContent></Card>
      {data.evaluation ? <Card size="sm"><CardHeader><CardTitle className="text-sm">Evaluation <Badge className="ml-2">{data.evaluation.score}/10</Badge></CardTitle><CardDescription>{data.evaluation.summary}</CardDescription></CardHeader><CardContent className="flex flex-col gap-2 text-sm">{data.evaluation.categories.map((c) => <div key={c.key}>{c.label}: {c.score}/10 <span className="text-xs text-muted-foreground">{c.comment}</span></div>)}</CardContent></Card> : <p className="text-sm text-muted-foreground">No evaluation yet.</p>}
    </div>
  )
}
