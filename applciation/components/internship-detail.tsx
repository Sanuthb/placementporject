"use client"

import * as React from "react"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { useAuth, hasRole } from "@/lib/web/auth"
import { fmtDate, fmtDateTime, statusVariant, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

export type Detail = {
  id: string; role: string; companyName: string | null; status: string; startDate: string; endDate: string; workDays: number[]; hoursPerDay: number; scheduleNote: string | null; stipendInr: number | null
  mentorName: string | null; mentorEmail: string | null; facultyMentorId: string | null; facultyMentorName: string | null; student: { id: string; name: string; enrollmentNo: string }
  certificateStatus: string; certificateName: string | null; certificateUrl: string | null; certificateNote: string | null; ppoStatus: string; ppoNote: string | null; completionOverride: string | null
  logs: { id: string; weekStart: string; hours: number; summary: string; status: string; reviewComment: string | null }[]
  evaluations: { id: string; evaluatorType: string; evaluatorName: string; score: number; remarks: string | null }[]
  feedback: { id: string; authorType: string; authorName: string; text: string; createdAt: string }[]
  attendance: { id: string; date: string; status: string; note: string | null; markedBy: string; verified: boolean }[]
  attendanceSummary: { workingDays: number; present: number; absent: number; leave: number; unmarked: number; unverified: number; percent: number | null }
  tasks: { id: string; title: string; description: string | null; dueAt: string | null; isFinalReport: boolean; status: string; assignedByName: string; submissionText: string | null; submissionUrl: string | null; fileName: string | null; fileUrl: string | null; submittedAt: string | null; reviewComment: string | null }[]
  links: { id: string; name: string; email: string; expiresAt: string; usedAt: string | null }[]
  completionChecks: { key: string; label: string; ok: boolean; blocking: boolean }[]
  summary: { approvedHours: number; logsAwaitingReview: number; averageScore: number | null }
}
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const TASK_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = { APPROVED: "default", SUBMITTED: "secondary", CHANGES_REQUESTED: "destructive", ASSIGNED: "outline" }

/** One internship for staff and the faculty mentor: status and completion, schedule, attendance, tasks and logs, feedback and evaluations, certificate and any offer. */
export function InternshipDetail({ id }: { id: string }) {
  const { data: d, reload } = useApi<Detail>(`/api/internships/${id}`)
  const { state } = useAuth()
  const staff = state.status === "ready" && hasRole(state.profile, "TPO_ADMIN", "PLACEMENT_OFFICER")
  const admin = state.status === "ready" && hasRole(state.profile, "TPO_ADMIN")
  const [busy, setBusy] = React.useState<string | null>(null)
  const [override, setOverride] = React.useState<string | null>(null)
  if (!d) return <Skeleton className="h-64" />
  async function run(key: string, f: () => Promise<unknown>, ok?: string) { setBusy(key); try { await f(); if (ok) toast.success(ok); reload() } catch (e) { toastError(e) } finally { setBusy(null) } }
  const setStatus = (status: string, extra: object = {}) => run("status", () => api(`/api/internships/${id}`, { method: "PATCH", body: { status, ...extra } }), "Status updated")
  const blockers = d.completionChecks.filter((c) => c.blocking && !c.ok && c.key !== "running")
  const a = d.attendanceSummary

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex items-center gap-2"><h1 className="text-xl font-semibold">{d.student.name}: {d.role}</h1><Badge variant={statusVariant(d.status === "COMPLETED" ? "VERIFIED" : d.status === "TERMINATED" ? "REJECTED" : "PENDING")}>{titleCase(d.status)}</Badge></div>
          <p className="text-sm text-muted-foreground">{d.companyName} · {fmtDate(d.startDate)} to {fmtDate(d.endDate)} · {d.summary.approvedHours} approved hours{d.summary.averageScore !== null ? ` · average score ${d.summary.averageScore}` : ""}{d.facultyMentorName ? ` · faculty mentor ${d.facultyMentorName}` : ""}</p></div>
        <div className="flex flex-wrap gap-2">
          {d.status === "ALLOTTED" && <Button disabled={busy === "status"} onClick={() => setStatus("ONGOING")}>Start the internship</Button>}
          {staff && d.status === "ONGOING" && <Button disabled={busy === "status"} onClick={() => (blockers.length ? (admin ? setOverride("") : toast.error("Not ready to complete", { description: blockers.map((b) => b.label).join("; ") })) : setStatus("COMPLETED"))}>Mark complete</Button>}
          {staff && (d.status === "ALLOTTED" || d.status === "ONGOING") && <Button variant="outline" disabled={busy === "status"} onClick={() => setStatus("TERMINATED")}>End early</Button>}
        </div>
      </div>
      {d.completionOverride && <Alert><AlertTitle>Completed with checks unmet</AlertTitle><AlertDescription>{d.completionOverride}</AlertDescription></Alert>}

      <Tabs defaultValue="overview">
        <TabsList><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="attendance">Attendance</TabsTrigger><TabsTrigger value="work">Tasks and logs</TabsTrigger><TabsTrigger value="feedback">Feedback and evaluation</TabsTrigger></TabsList>

        <TabsContent value="overview" className="grid gap-4 md:grid-cols-2">
          <Card size="sm"><CardHeader><CardTitle>Before it can be completed</CardTitle></CardHeader><CardContent className="flex flex-col gap-1 text-sm">{d.completionChecks.filter((c) => c.key !== "running").map((c) => <div key={c.key} className="flex items-center gap-2"><Badge variant={c.ok ? "default" : c.blocking ? "destructive" : "secondary"}>{c.ok ? "Done" : c.blocking ? "Needed" : "Advised"}</Badge>{c.label}</div>)}</CardContent></Card>
          <Schedule d={d} editable={staff} onSaved={reload} />
          {staff && <Mentors d={d} onSaved={reload} />}
          <Certificate d={d} staff={staff} run={run} busy={busy} />
          {staff && (d.status === "ONGOING" || d.status === "COMPLETED") && <Ppo d={d} onSaved={reload} />}
        </TabsContent>

        <TabsContent value="attendance" className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{a.present} present, {a.absent} absent, {a.leave} on leave, {a.unmarked} not marked, out of {a.workingDays} working days so far{a.percent !== null ? ` · ${a.percent}% attendance` : ""}. {a.unverified} waiting for you to verify.</p>
          <AttendanceTable d={d} id={id} run={run} />
        </TabsContent>

        <TabsContent value="work" className="flex flex-col gap-4">
          <Tasks d={d} id={id} run={run} busy={busy} />
          <Card size="sm"><CardHeader><CardTitle>Weekly work logs</CardTitle></CardHeader><CardContent>
            <Table><TableHeader><TableRow><TableHead>Week</TableHead><TableHead>Hours</TableHead><TableHead>Summary</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Review</TableHead></TableRow></TableHeader>
              <TableBody>{d.logs.map((l) => <TableRow key={l.id}><TableCell>{fmtDate(l.weekStart)}</TableCell><TableCell>{l.hours}</TableCell><TableCell className="max-w-xs text-muted-foreground">{l.summary}</TableCell><TableCell><Badge variant={statusVariant(l.status === "APPROVED" ? "VERIFIED" : l.status === "REJECTED" ? "REJECTED" : "PENDING")}>{titleCase(l.status)}</Badge>{l.reviewComment && <div className="text-xs text-muted-foreground">{l.reviewComment}</div>}</TableCell>
                <TableCell className="text-right">{l.status === "SUBMITTED" && <Button size="sm" disabled={!!busy} onClick={() => run("log", () => api(`/api/internships/${id}/logs/${l.id}/review`, { method: "POST", body: { decision: "APPROVE" } }), "Log approved")}>Approve</Button>}</TableCell></TableRow>)}
                {d.logs.length === 0 && <TableRow><TableCell colSpan={5} className="text-muted-foreground">No logs submitted yet.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
        </TabsContent>

        <TabsContent value="feedback" className="grid gap-4 lg:grid-cols-2"><FeedbackPane d={d} id={id} staff={staff} run={run} busy={busy} onSaved={reload} /></TabsContent>
      </Tabs>

      {override !== null && <Dialog open onOpenChange={(o) => !o && setOverride(null)}><DialogContent><DialogHeader><DialogTitle>Complete although checks are unmet</DialogTitle></DialogHeader>
        <Alert><AlertTitle>Still needed</AlertTitle><AlertDescription><ul className="list-disc pl-5">{blockers.map((b) => <li key={b.key}>{b.label}</li>)}</ul></AlertDescription></Alert>
        <Textarea aria-label="Reason" placeholder="Why complete it anyway? (at least 10 characters; kept on the record)" value={override} onChange={(e) => setOverride(e.target.value)} />
        <DialogFooter><Button disabled={override.trim().length < 10} onClick={() => { const r = override; setOverride(null); void setStatus("COMPLETED", { overrideReason: r }) }}>Complete with this reason</Button></DialogFooter></DialogContent></Dialog>}
    </div>
  )
}

function Schedule({ d, editable, onSaved }: { d: Detail; editable: boolean; onSaved: () => void }) {
  const [days, setDays] = React.useState(d.workDays)
  const [hours, setHours] = React.useState(String(d.hoursPerDay))
  const [note, setNote] = React.useState(d.scheduleNote ?? "")
  const [busy, setBusy] = React.useState(false)
  const over = d.status === "COMPLETED" || d.status === "TERMINATED"
  return (
    <Card size="sm"><CardHeader><CardTitle>Schedule</CardTitle><CardDescription>{d.workDays.map((x) => DAYS[x]).join(", ")} · {d.hoursPerDay} hours a day{d.stipendInr ? ` · ₹${d.stipendInr} a month` : ""}</CardDescription></CardHeader>
      {editable && !over && <CardContent><form className="flex flex-col gap-3" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await api(`/api/internships/${d.id}/schedule`, { method: "PATCH", body: { workDays: days, hoursPerDay: Number(hours), scheduleNote: note || null } }); toast.success("Schedule saved"); onSaved() } catch (err) { toastError(err) } finally { setBusy(false) } }}>
        <div className="flex flex-wrap gap-3 text-sm">{DAYS.map((n, i) => <label key={n} className="flex items-center gap-1"><Checkbox checked={days.includes(i)} onCheckedChange={(x) => setDays((a) => (x ? [...a, i] : a.filter((y) => y !== i)))} />{n}</label>)}</div>
        <Field><FieldLabel htmlFor="s-h">Hours a day</FieldLabel><Input id="s-h" className="w-24" type="number" min={1} max={12} value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
        <Field><FieldLabel htmlFor="s-n">Schedule note (timings, reporting place)</FieldLabel><Input id="s-n" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div><Button type="submit" size="sm" disabled={busy || days.length === 0}>{busy && <Spinner />}Save schedule</Button></div></form></CardContent>}
      {d.scheduleNote && !editable && <CardContent className="text-sm">{d.scheduleNote}</CardContent>}
    </Card>
  )
}

function Mentors({ d, onSaved }: { d: Detail; onSaved: () => void }) {
  const guides = useApi<{ id: string; name: string }[]>("/api/projects/guides")
  const [fm, setFm] = React.useState(d.facultyMentorId ?? "")
  const [name, setName] = React.useState(d.mentorName ?? "")
  const [email, setEmail] = React.useState(d.mentorEmail ?? "")
  const [busy, setBusy] = React.useState(false)
  return (
    <Card size="sm"><CardHeader><CardTitle>Mentors</CardTitle><CardDescription>The faculty mentor follows the student for the college; the company mentor guides the work.</CardDescription></CardHeader>
      <CardContent><form className="flex flex-col gap-3" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await api(`/api/internships/${d.id}/mentor`, { method: "PUT", body: { facultyMentorId: fm || null, industryMentorName: name || null, industryMentorEmail: email || null } }); toast.success("Mentors saved"); onSaved() } catch (err) { toastError(err) } finally { setBusy(false) } }}>
        <Field><FieldLabel>Faculty mentor</FieldLabel><OptionSelect className="w-full" value={fm} onChange={setFm} options={[{ value: "", label: "None" }, ...(guides.data ?? []).map((g) => ({ value: g.id, label: g.name }))]} placeholder="None" /></Field>
        <Field><FieldLabel htmlFor="m-n">Company mentor&apos;s name</FieldLabel><Input id="m-n" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field><FieldLabel htmlFor="m-e">Company mentor&apos;s email</FieldLabel><Input id="m-e" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <div><Button type="submit" size="sm" disabled={busy}>{busy && <Spinner />}Save mentors</Button></div></form></CardContent></Card>
  )
}

function Certificate({ d, staff, run, busy }: { d: Detail; staff: boolean; run: (k: string, f: () => Promise<unknown>, ok?: string) => Promise<void>; busy: string | null }) {
  const [note, setNote] = React.useState("")
  return (
    <Card size="sm"><CardHeader><CardTitle>Completion certificate</CardTitle><CardDescription>{titleCase(d.certificateStatus)}{d.certificateNote ? `: ${d.certificateNote}` : ""}</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {d.certificateUrl && <a className="underline underline-offset-4" href={d.certificateUrl} target="_blank" rel="noreferrer">{d.certificateName}</a>}
        {!d.certificateUrl && <span className="text-muted-foreground">Not uploaded by the student yet.</span>}
        {staff && d.certificateStatus === "PENDING" && <div className="flex flex-col gap-2"><Input aria-label="Reason for rejecting" placeholder="Reason (needed to reject)" value={note} onChange={(e) => setNote(e.target.value)} /><div className="flex gap-2"><Button size="sm" disabled={busy === "cert"} onClick={() => run("cert", () => api(`/api/internships/${d.id}/certificate`, { method: "PATCH", body: { decision: "VERIFY" } }), "Certificate verified")}>Verify</Button><Button size="sm" variant="outline" disabled={busy === "cert" || note.trim().length < 3} onClick={() => run("cert", () => api(`/api/internships/${d.id}/certificate`, { method: "PATCH", body: { decision: "REJECT", note } }), "Rejected")}>Reject</Button></div></div>}
      </CardContent></Card>
  )
}

const PPO = ["NONE", "EXPECTED", "OFFERED", "ACCEPTED", "DECLINED"].map((v) => ({ value: v, label: titleCase(v) }))
function Ppo({ d, onSaved }: { d: Detail; onSaved: () => void }) {
  const [v, setV] = React.useState(d.ppoStatus)
  const [note, setNote] = React.useState(d.ppoNote ?? "")
  const [busy, setBusy] = React.useState(false)
  return (
    <Card size="sm"><CardHeader><CardTitle>Pre-placement offer</CardTitle><CardDescription>Currently: {titleCase(d.ppoStatus)}. Record the offer itself under Offers, marked as a pre-placement offer.</CardDescription></CardHeader>
      <CardContent><form className="flex flex-col gap-3" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await api(`/api/internships/${d.id}/ppo`, { method: "PATCH", body: { status: v, note: note || null } }); toast.success("Saved"); onSaved() } catch (err) { toastError(err) } finally { setBusy(false) } }}>
        <OptionSelect className="w-full" value={v} onChange={setV} options={PPO} placeholder="Status" /><Input aria-label="Note" placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        <div><Button type="submit" size="sm" disabled={busy || v === d.ppoStatus}>{busy && <Spinner />}Save</Button></div></form></CardContent></Card>
  )
}

function AttendanceTable({ d, id, run }: { d: Detail; id: string; run: (k: string, f: () => Promise<unknown>, ok?: string) => Promise<void> }) {
  const [date, setDate] = React.useState("")
  const [status, setStatus] = React.useState("PRESENT")
  const [picked, setPicked] = React.useState<Set<string>>(new Set())
  const toggle = (k: string) => setPicked((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const unverified = d.attendance.filter((x) => !x.verified)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2"><Field className="w-44"><FieldLabel htmlFor="a-d">Mark or correct a day</FieldLabel><Input id="a-d" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field><OptionSelect className="w-36" value={status} onChange={setStatus} options={["PRESENT", "ABSENT", "LEAVE"].map((v) => ({ value: v, label: titleCase(v) }))} placeholder="Status" /><Button size="sm" variant="outline" disabled={!date} onClick={() => run("att", () => api(`/api/internships/${id}/attendance`, { method: "POST", body: { date, status } }), "Day saved")}>Save day</Button>
        <Button size="sm" disabled={picked.size === 0} onClick={() => run("att", async () => { await api(`/api/internships/${id}/attendance`, { method: "POST", body: { verifyIds: [...picked] } }); setPicked(new Set()) }, "Verified")}>Verify {picked.size} selected</Button>
        {unverified.length > 0 && <Button size="sm" variant="ghost" onClick={() => setPicked(new Set(unverified.map((x) => x.id)))}>Select all unverified</Button>}</div>
      <Table><TableHeader><TableRow><TableHead /><TableHead>Date</TableHead><TableHead>Status</TableHead><TableHead>Note</TableHead><TableHead>Marked by</TableHead><TableHead>Verified</TableHead></TableRow></TableHeader>
        <TableBody>{d.attendance.slice(0, 120).map((x) => <TableRow key={x.id}><TableCell>{!x.verified && <Checkbox aria-label={`Select ${x.date}`} checked={picked.has(x.id)} onCheckedChange={() => toggle(x.id)} />}</TableCell><TableCell>{fmtDate(x.date)}</TableCell><TableCell>{titleCase(x.status)}</TableCell><TableCell className="text-muted-foreground">{x.note}</TableCell><TableCell>{titleCase(x.markedBy)}</TableCell><TableCell>{x.verified ? "Yes" : "No"}</TableCell></TableRow>)}
          {d.attendance.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Nothing marked yet.</TableCell></TableRow>}</TableBody></Table>
    </div>
  )
}

function Tasks({ d, id, run, busy }: { d: Detail; id: string; run: (k: string, f: () => Promise<unknown>, ok?: string) => Promise<void>; busy: string | null }) {
  const [add, setAdd] = React.useState({ title: "", description: "", dueAt: "" })
  const [rev, setRev] = React.useState<{ id: string; comment: string } | null>(null)
  return (
    <Card size="sm"><CardHeader><CardTitle>Tasks and deliverables</CardTitle><CardDescription>The final report is created for you. Approve work or ask for changes.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {d.tasks.map((t) => (
          <div key={t.id} className="flex flex-col gap-1 rounded-md border p-2">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{t.title}{t.isFinalReport && " (final report)"}</span><span className="flex items-center gap-2 text-xs text-muted-foreground">{t.dueAt && `due ${fmtDate(t.dueAt)}`}<Badge variant={TASK_VARIANT[t.status]}>{titleCase(t.status)}</Badge></span></div>
            {t.description && <p className="text-muted-foreground">{t.description}</p>}
            {t.submittedAt && <div className="rounded bg-muted p-2">{t.submissionText && <p className="whitespace-pre-wrap">{t.submissionText}</p>}{t.submissionUrl && <p><a className="underline underline-offset-4" href={t.submissionUrl} target="_blank" rel="noreferrer">{t.submissionUrl}</a></p>}{t.fileUrl && <p><a className="underline underline-offset-4" href={t.fileUrl} target="_blank" rel="noreferrer">{t.fileName}</a></p>}<p className="text-xs text-muted-foreground">Handed in {fmtDateTime(t.submittedAt)}</p></div>}
            {t.reviewComment && <p className="text-xs text-muted-foreground">Review: {t.reviewComment}</p>}
            {t.status === "SUBMITTED" && <div className="flex gap-2"><Button size="sm" disabled={!!busy} onClick={() => run("task", () => api(`/api/internships/${id}/tasks/${t.id}`, { method: "POST", body: { action: "APPROVE" } }), "Approved")}>Approve</Button><Button size="sm" variant="outline" onClick={() => setRev({ id: t.id, comment: "" })}>Ask for changes</Button></div>}
            {!t.isFinalReport && !t.submittedAt && <div><Button size="sm" variant="ghost" onClick={() => run("task", () => api(`/api/internships/${id}/tasks/${t.id}`, { method: "DELETE" }), "Removed")}>Remove</Button></div>}
          </div>
        ))}
        {d.status !== "COMPLETED" && d.status !== "TERMINATED" && <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); void run("task", async () => { await api(`/api/internships/${id}/tasks`, { method: "POST", body: { title: add.title, description: add.description || undefined, dueAt: add.dueAt ? new Date(add.dueAt).toISOString() : undefined } }); setAdd({ title: "", description: "", dueAt: "" }) }, "Task given; the student was told") }}>
          <Input aria-label="Task title" placeholder="New task for the intern" value={add.title} onChange={(e) => setAdd((o) => ({ ...o, title: e.target.value }))} /><Input aria-label="Task details" placeholder="Details (optional)" value={add.description} onChange={(e) => setAdd((o) => ({ ...o, description: e.target.value }))} /><div className="flex gap-2"><Input aria-label="Due date" className="w-44" type="date" value={add.dueAt} onChange={(e) => setAdd((o) => ({ ...o, dueAt: e.target.value }))} /><Button type="submit" size="sm" variant="outline" disabled={!!busy || add.title.trim().length < 3}>Give task</Button></div></form>}
      </CardContent>
      {rev && <Dialog open onOpenChange={(o) => !o && setRev(null)}><DialogContent><DialogHeader><DialogTitle>What needs to change?</DialogTitle></DialogHeader><Textarea aria-label="Comment" value={rev.comment} onChange={(e) => setRev({ ...rev, comment: e.target.value })} /><DialogFooter><Button disabled={rev.comment.trim().length < 3} onClick={() => { const r = rev; setRev(null); void run("task", () => api(`/api/internships/${id}/tasks/${r.id}`, { method: "POST", body: { action: "REQUEST_CHANGES", comment: r.comment } }), "Sent back") }}>Send back</Button></DialogFooter></DialogContent></Dialog>}
    </Card>
  )
}

function FeedbackPane({ d, id, staff, run, busy, onSaved }: { d: Detail; id: string; staff: boolean; run: (k: string, f: () => Promise<unknown>, ok?: string) => Promise<void>; busy: string | null; onSaved: () => void }) {
  const [text, setText] = React.useState("")
  const [type, setType] = React.useState("FACULTY")
  const [ev, setEv] = React.useState({ name: "", score: "", remarks: "" })
  const [inv, setInv] = React.useState({ name: d.mentorName ?? "", email: d.mentorEmail ?? "" })
  const [link, setLink] = React.useState<{ link: string; emailed: boolean } | null>(null)
  return (
    <>
      <div className="flex flex-col gap-4">
        <Card size="sm"><CardHeader><CardTitle>Feedback for the student</CardTitle></CardHeader><CardContent className="flex flex-col gap-2 text-sm">
          <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); void run("fb", async () => { await api(`/api/internships/${id}/feedback`, { method: "POST", body: { text } }); setText("") }, "Feedback sent") }}><Textarea aria-label="Feedback" value={text} onChange={(e) => setText(e.target.value)} placeholder="Feedback the student will see" /><div><Button type="submit" size="sm" disabled={!!busy || text.trim().length < 3}>Send feedback</Button></div></form>
          {d.feedback.map((f) => <div key={f.id} className="rounded-md border p-2"><div className="text-xs text-muted-foreground">{f.authorName} ({titleCase(f.authorType)}) · {fmtDateTime(f.createdAt)}</div><p className="whitespace-pre-wrap">{f.text}</p></div>)}
        </CardContent></Card>
        {staff && <Card size="sm"><CardHeader><CardTitle>Ask the company&apos;s mentor</CardTitle><CardDescription>A one-time link, no account needed. Send it only to the mentor.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3 text-sm">
          <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); void run("lnk", async () => { setLink(await api(`/api/internships/${id}/links`, { method: "POST", body: inv })) }, "Invitation created") }}><Input aria-label="Mentor name" placeholder="Mentor's name" required value={inv.name} onChange={(e) => setInv((o) => ({ ...o, name: e.target.value }))} /><Input aria-label="Mentor email" type="email" placeholder="Mentor's email" required value={inv.email} onChange={(e) => setInv((o) => ({ ...o, email: e.target.value }))} /><div><Button type="submit" size="sm" disabled={!!busy}>Create invitation</Button></div></form>
          {link && <Alert><AlertTitle>{link.emailed ? "Emailed to the mentor" : "Email is not set up: share this link yourself"}</AlertTitle><AlertDescription className="break-all">{link.link}</AlertDescription></Alert>}
          {d.links.map((l) => <div key={l.id} className="flex justify-between"><span>{l.name} ({l.email})</span><span className="text-muted-foreground">{l.usedAt ? "evaluated" : new Date(l.expiresAt) < new Date() ? "expired" : `open until ${fmtDate(l.expiresAt)}`}</span></div>)}
        </CardContent></Card>}
      </div>
      <div className="flex flex-col gap-4">
        <Card size="sm"><CardHeader><CardTitle>Evaluations</CardTitle></CardHeader><CardContent className="flex flex-col gap-2 text-sm">{d.evaluations.map((e) => <div key={e.id} className="rounded-md border p-2"><span className="font-medium">{e.score}/100</span> · {titleCase(e.evaluatorType)} · {e.evaluatorName}{e.remarks && <div className="text-muted-foreground">{e.remarks}</div>}</div>)}{d.evaluations.length === 0 && <span className="text-muted-foreground">None yet.</span>}</CardContent></Card>
        <Card size="sm"><CardHeader><CardTitle>Add an evaluation</CardTitle></CardHeader><CardContent>
          <form onSubmit={(e) => { e.preventDefault(); void run("ev", async () => { await api(`/api/internships/${id}/evaluations`, { method: "POST", body: { evaluatorType: staff ? type : "FACULTY", evaluatorName: ev.name, score: Number(ev.score), ...(ev.remarks ? { remarks: ev.remarks } : {}) } }); setEv({ name: "", score: "", remarks: "" }); onSaved() }, "Evaluation saved") }}>
            <FieldGroup>
              {staff && <Field><FieldLabel>Evaluated by</FieldLabel><OptionSelect className="w-full" value={type} onChange={setType} options={[{ value: "FACULTY", label: "Faculty" }, { value: "COMPANY", label: "Company" }]} placeholder="Type" /></Field>}
              <Field><FieldLabel htmlFor="e-n">Evaluator name</FieldLabel><Input id="e-n" minLength={2} required value={ev.name} onChange={(e) => setEv((o) => ({ ...o, name: e.target.value }))} /></Field>
              <Field><FieldLabel htmlFor="e-s">Score (0 to 100)</FieldLabel><Input id="e-s" type="number" min={0} max={100} required value={ev.score} onChange={(e) => setEv((o) => ({ ...o, score: e.target.value }))} /></Field>
              <Field><FieldLabel htmlFor="e-r">Remarks</FieldLabel><Textarea id="e-r" value={ev.remarks} onChange={(e) => setEv((o) => ({ ...o, remarks: e.target.value }))} /></Field>
              <Field><Button type="submit" disabled={!!busy}>Save evaluation</Button></Field>
            </FieldGroup></form></CardContent></Card>
      </div>
    </>
  )
}
