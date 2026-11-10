"use client"

import * as React from "react"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import type { Detail } from "@/components/internship-detail"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, fmtDateTime, statusVariant, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

const TASK_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = { APPROVED: "default", SUBMITTED: "secondary", CHANGES_REQUESTED: "destructive", ASSIGNED: "outline" }
const today = () => new Date().toISOString().slice(0, 10)

/** One of my internships: attendance, tasks and the final report, weekly logs, feedback, certificate and any offer. */
export function StudentInternship({ id, title }: { id: string; title: string }) {
  const { data: d, reload } = useApi<Detail>(`/api/student/internships/${id}`)
  if (!d) return <Skeleton className="h-48" />
  const ongoing = d.status === "ONGOING"
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle><CardDescription>{fmtDate(d.startDate)} to {fmtDate(d.endDate)} · <Badge variant="outline">{titleCase(d.status)}</Badge>{d.facultyMentorName ? ` · faculty mentor ${d.facultyMentorName}` : ""}{d.mentorName ? ` · company mentor ${d.mentorName}` : ""}</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4">
        {d.ppoStatus === "OFFERED" && <Alert><AlertTitle>You have a pre-placement offer</AlertTitle><AlertDescription>{d.companyName} has offered you a job. Your placement office will guide you on responding.</AlertDescription></Alert>}
        {d.ppoStatus === "ACCEPTED" && <Alert><AlertTitle>Pre-placement offer accepted</AlertTitle></Alert>}
        <Tabs defaultValue="tasks">
          <TabsList><TabsTrigger value="tasks">Tasks ({d.tasks.filter((t) => t.status !== "APPROVED").length} open)</TabsTrigger><TabsTrigger value="attendance">Attendance{d.attendanceSummary.percent !== null ? ` (${d.attendanceSummary.percent}%)` : ""}</TabsTrigger><TabsTrigger value="logs">Weekly logs</TabsTrigger><TabsTrigger value="feedback">Feedback ({d.feedback.length + d.evaluations.length})</TabsTrigger><TabsTrigger value="certificate">Certificate</TabsTrigger></TabsList>
          <TabsContent value="tasks"><Tasks d={d} id={id} ongoing={ongoing} reload={reload} /></TabsContent>
          <TabsContent value="attendance"><Attendance d={d} id={id} ongoing={ongoing} reload={reload} /></TabsContent>
          <TabsContent value="logs"><Logs id={id} ongoing={d.status !== "COMPLETED" && d.status !== "TERMINATED"} /></TabsContent>
          <TabsContent value="feedback" className="flex flex-col gap-2 text-sm">
            {d.evaluations.map((e) => <div key={e.id} className="rounded-md border p-3"><span className="font-medium">{e.score}/100</span> · {e.evaluatorName}{e.remarks && <div className="text-muted-foreground">{e.remarks}</div>}</div>)}
            {d.feedback.map((f) => <div key={f.id} className="rounded-md border p-3"><div className="text-xs text-muted-foreground">{f.authorName} ({titleCase(f.authorType)}) · {fmtDateTime(f.createdAt)}</div><p className="whitespace-pre-wrap">{f.text}</p></div>)}
            {d.evaluations.length + d.feedback.length === 0 && <p className="text-muted-foreground">No feedback yet.</p>}
          </TabsContent>
          <TabsContent value="certificate"><Certificate d={d} id={id} reload={reload} /></TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

function Tasks({ d, id, ongoing, reload }: { d: Detail; id: string; ongoing: boolean; reload: () => void }) {
  const [open, setOpen] = React.useState<string | null>(null)
  const [text, setText] = React.useState("")
  const [url, setUrl] = React.useState("")
  const [file, setFile] = React.useState<File | null>(null)
  const [busy, setBusy] = React.useState(false)
  async function send(taskId: string) {
    setBusy(true)
    try { const fd = new FormData(); fd.set("text", text); fd.set("url", url); if (file) fd.set("file", file); await api(`/api/student/internships/${id}/tasks/${taskId}/submit`, { method: "POST", body: fd }); toast.success("Handed in"); setOpen(null); setText(""); setUrl(""); setFile(null); reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  return (
    <div className="flex flex-col gap-3 text-sm">
      {d.tasks.map((t) => (
        <div key={t.id} className="flex flex-col gap-1 rounded-md border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{t.title}{t.isFinalReport && " (final report)"}</span><span className="flex items-center gap-2 text-xs text-muted-foreground">{t.dueAt && `due ${fmtDate(t.dueAt)}`}<Badge variant={TASK_VARIANT[t.status]}>{titleCase(t.status)}</Badge></span></div>
          {t.description && <p className="text-muted-foreground">{t.description}</p>}
          {t.reviewComment && <p className="rounded bg-muted p-2">Your reviewer: {t.reviewComment}</p>}
          {t.submittedAt && <p className="text-xs text-muted-foreground">Handed in {fmtDateTime(t.submittedAt)}{t.fileUrl && <> · <a className="underline underline-offset-4" href={t.fileUrl} target="_blank" rel="noreferrer">{t.fileName}</a></>}</p>}
          {ongoing && (t.status === "ASSIGNED" || t.status === "CHANGES_REQUESTED") && (open === t.id ? (
            <div className="flex flex-col gap-2"><Textarea aria-label="Your work" placeholder="Describe your work or paste your report" value={text} onChange={(e) => setText(e.target.value)} /><Input aria-label="Link" type="url" placeholder="A link to your work (optional)" value={url} onChange={(e) => setUrl(e.target.value)} /><Input aria-label="File" type="file" accept=".pdf,.docx,.pptx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /><div className="flex gap-2"><Button size="sm" disabled={busy || (!text.trim() && !url.trim() && !file)} onClick={() => send(t.id)}>{busy && <Spinner />}Hand in</Button><Button size="sm" variant="ghost" onClick={() => setOpen(null)}>Cancel</Button></div></div>
          ) : <div><Button size="sm" variant="outline" onClick={() => { setOpen(t.id); setText(t.submissionText ?? ""); setUrl(t.submissionUrl ?? "") }}>{t.status === "CHANGES_REQUESTED" ? "Hand in again" : "Hand in work"}</Button></div>)}
        </div>
      ))}
    </div>
  )
}

function Attendance({ d, id, ongoing, reload }: { d: Detail; id: string; ongoing: boolean; reload: () => void }) {
  const [date, setDate] = React.useState(today())
  const [status, setStatus] = React.useState("PRESENT")
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const a = d.attendanceSummary
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-muted-foreground">{a.present} present, {a.absent} absent, {a.leave} on leave, {a.unmarked} not marked, of {a.workingDays} working days so far{a.percent !== null ? ` · ${a.percent}%` : ""}. Your mentor verifies the days you mark.</p>
      {ongoing && <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await api(`/api/student/internships/${id}/attendance`, { method: "POST", body: { date, status, note: note || undefined } }); toast.success("Saved"); setNote(""); reload() } catch (err) { toastError(err) } finally { setBusy(false) } }}>
        <Field className="w-44"><FieldLabel htmlFor="at-d">Day</FieldLabel><Input id="at-d" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <OptionSelect className="w-36" value={status} onChange={setStatus} options={["PRESENT", "ABSENT", "LEAVE"].map((v) => ({ value: v, label: titleCase(v) }))} placeholder="Status" />
        <Input aria-label="Note" className="w-56" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} /><Button type="submit" size="sm" disabled={busy}>{busy && <Spinner />}Save</Button></form>}
      <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Status</TableHead><TableHead>Verified</TableHead></TableRow></TableHeader><TableBody>{d.attendance.slice(0, 60).map((x) => <TableRow key={x.id}><TableCell>{fmtDate(x.date)}</TableCell><TableCell>{titleCase(x.status)}{x.note ? ` · ${x.note}` : ""}</TableCell><TableCell>{x.verified ? "Yes" : "Waiting"}</TableCell></TableRow>)}{d.attendance.length === 0 && <TableRow><TableCell colSpan={3} className="text-muted-foreground">Nothing marked yet.</TableCell></TableRow>}</TableBody></Table>
    </div>
  )
}

type Log = { id: string; weekStart: string; hours: number; summary: string; status: string; reviewComment: string | null }
function Logs({ id, ongoing }: { id: string; ongoing: boolean }) {
  const logs = useApi<Log[]>(`/api/student/internships/${id}/logs`)
  const [busy, setBusy] = React.useState(false)
  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget), form = e.currentTarget
    setBusy(true)
    try { await api(`/api/student/internships/${id}/logs`, { method: "POST", body: { weekStart: new Date(String(f.get("weekStart"))).toISOString(), hours: Number(f.get("hours")), summary: f.get("summary") } }); toast.success("Log submitted for review"); form.reset(); logs.reload() } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  return (
    <div className="flex flex-col gap-4">
      <Table><TableHeader><TableRow><TableHead>Week of</TableHead><TableHead>Hours</TableHead><TableHead>What you did</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
        <TableBody>{logs.data?.map((l) => <TableRow key={l.id}><TableCell>{fmtDate(l.weekStart)}</TableCell><TableCell>{l.hours}</TableCell><TableCell className="max-w-xs text-muted-foreground">{l.summary}</TableCell><TableCell><Badge variant={statusVariant(l.status === "APPROVED" ? "VERIFIED" : l.status === "REJECTED" ? "REJECTED" : "PENDING")}>{titleCase(l.status)}</Badge>{l.reviewComment && <div className="text-xs text-muted-foreground">{l.reviewComment}</div>}</TableCell></TableRow>)}{logs.data?.length === 0 && <TableRow><TableCell colSpan={4} className="text-muted-foreground">No logs yet.</TableCell></TableRow>}</TableBody></Table>
      {ongoing && <form onSubmit={add}><FieldGroup>
        <div className="grid gap-3 sm:grid-cols-2"><Field><FieldLabel htmlFor={`w${id}`}>Week starting</FieldLabel><Input id={`w${id}`} name="weekStart" type="date" required /></Field><Field><FieldLabel htmlFor={`h${id}`}>Hours worked</FieldLabel><Input id={`h${id}`} name="hours" type="number" min={1} max={80} required /></Field></div>
        <Field><FieldLabel htmlFor={`s${id}`}>What did you do this week?</FieldLabel><Textarea id={`s${id}`} name="summary" minLength={10} required /></Field>
        <Field><Button type="submit" disabled={busy}>{busy && <Spinner />}Submit weekly log</Button></Field></FieldGroup></form>}
    </div>
  )
}

function Certificate({ d, id, reload }: { d: Detail; id: string; reload: () => void }) {
  const [file, setFile] = React.useState<File | null>(null)
  const [busy, setBusy] = React.useState(false)
  const can = (d.status === "ONGOING" || d.status === "COMPLETED") && d.certificateStatus !== "VERIFIED"
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p>Status: <Badge variant="outline">{titleCase(d.certificateStatus)}</Badge>{d.certificateNote ? ` · ${d.certificateNote}` : ""}</p>
      {d.certificateUrl && <p><a className="underline underline-offset-4" href={d.certificateUrl} target="_blank" rel="noreferrer">{d.certificateName}</a></p>}
      {can && <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); if (!file) return; setBusy(true); try { const fd = new FormData(); fd.set("file", file); await api(`/api/student/internships/${id}/certificate`, { method: "POST", body: fd }); toast.success("Uploaded; your placement office will verify it"); setFile(null); reload() } catch (err) { toastError(err) } finally { setBusy(false) } }}>
        <Field className="w-72"><FieldLabel htmlFor="cert">Completion certificate (PDF, PNG or JPEG, up to 10 MB)</FieldLabel><Input id="cert" type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field><Button type="submit" size="sm" disabled={busy || !file}>{busy && <Spinner />}Upload</Button></form>}
    </div>
  )
}
