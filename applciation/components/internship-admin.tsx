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
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, titleCase } from "@/lib/web/format"
import { useLookups } from "@/lib/web/lookups"
import { useApi } from "@/lib/web/use-api"

type Posting = { id: string; title: string; companyName: string; mode: string; status: string; openings: number | null; applicationDeadline: string; startDate: string; endDate: string; companyConfirmed: boolean; applications: number; selected: number }
type Full = Posting & { description: string | null; location: string | null; stipendInr: number | null; skills: string[]; companyConfirmedNote: string | null; minCgpa: string | null; minTenthPct: string | null; minTwelfthPct: string | null; maxActiveBacklogs: number | null; departmentIds: string[]; batchIds: string[]; allowPlaced: boolean; problems: string[] }
const MODES = [{ value: "ONSITE", label: "On site" }, { value: "REMOTE", label: "Remote" }, { value: "HYBRID", label: "Hybrid" }]
const d10 = (d: string | null) => (d ? d.slice(0, 10) : "")
const dt = (d: string) => new Date(new Date(d).getTime() - new Date(d).getTimezoneOffset() * 60000).toISOString().slice(0, 16)

type Values = { title: string; companyName: string; description: string; location: string; mode: string; stipendInr: string; openings: string; skills: string; startDate: string; endDate: string; applicationDeadline: string; minCgpa: string; minTenthPct: string; minTwelfthPct: string; maxActiveBacklogs: string; departmentIds: string[]; batchIds: string[]; allowPlaced: boolean; companyConfirmed: boolean; companyConfirmedNote: string }
const BLANK: Values = { title: "", companyName: "", description: "", location: "", mode: "ONSITE", stipendInr: "", openings: "", skills: "", startDate: "", endDate: "", applicationDeadline: "", minCgpa: "", minTenthPct: "", minTwelfthPct: "", maxActiveBacklogs: "", departmentIds: [], batchIds: [], allowPlaced: true, companyConfirmed: false, companyConfirmedNote: "" }
const fromFull = (p: Full): Values => ({ title: p.title, companyName: p.companyName, description: p.description ?? "", location: p.location ?? "", mode: p.mode, stipendInr: p.stipendInr?.toString() ?? "", openings: p.openings?.toString() ?? "", skills: p.skills.join(", "), startDate: d10(p.startDate), endDate: d10(p.endDate), applicationDeadline: dt(p.applicationDeadline), minCgpa: p.minCgpa ?? "", minTenthPct: p.minTenthPct ?? "", minTwelfthPct: p.minTwelfthPct ?? "", maxActiveBacklogs: p.maxActiveBacklogs?.toString() ?? "", departmentIds: p.departmentIds, batchIds: p.batchIds, allowPlaced: p.allowPlaced, companyConfirmed: p.companyConfirmed, companyConfirmedNote: p.companyConfirmedNote ?? "" })
const n = (s: string) => (s.trim() === "" ? null : Number(s))
const body = (v: Values) => ({ title: v.title, companyName: v.companyName, description: v.description || null, location: v.location || null, mode: v.mode, stipendInr: n(v.stipendInr), openings: n(v.openings), skills: v.skills.split(",").map((x) => x.trim()).filter(Boolean), startDate: new Date(v.startDate).toISOString(), endDate: new Date(v.endDate).toISOString(), applicationDeadline: new Date(v.applicationDeadline).toISOString(), minCgpa: n(v.minCgpa), minTenthPct: n(v.minTenthPct), minTwelfthPct: n(v.minTwelfthPct), maxActiveBacklogs: n(v.maxActiveBacklogs), departmentIds: v.departmentIds, batchIds: v.batchIds, allowPlaced: v.allowPlaced })

/** Postings: the company's internships the college offers. Open one once the company has confirmed it. */
export function Postings() {
  const { data, reload } = useApi<Posting[]>("/api/internship-postings")
  const lk = useLookups()
  const [form, setForm] = React.useState<{ id?: string; v: Values } | null>(null)
  const [apps, setApps] = React.useState<Posting | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  if (!data) return <Skeleton className="h-48" />
  const set = (p: Partial<Values>) => setForm((f) => (f ? { ...f, v: { ...f.v, ...p } } : f))
  const toggle = (k: "departmentIds" | "batchIds", id: string) => form && set({ [k]: form.v[k].includes(id) ? form.v[k].filter((x) => x !== id) : [...form.v[k], id] })
  async function edit(p: Posting) { try { setForm({ id: p.id, v: fromFull(await api<Full>(`/api/internship-postings/${p.id}`)) }) } catch (e) { toastError(e) } }
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!form) return; setBusy("save")
    try {
      let id = form.id
      if (id) await api(`/api/internship-postings/${id}`, { method: "PATCH", body: { ...body(form.v), companyConfirmed: form.v.companyConfirmed, companyConfirmedNote: form.v.companyConfirmedNote || null } })
      else { const r = await api<{ id: string }>("/api/internship-postings", { method: "POST", body: body(form.v) }); id = r.id; if (form.v.companyConfirmed) await api(`/api/internship-postings/${id}`, { method: "PATCH", body: { companyConfirmed: true, companyConfirmedNote: form.v.companyConfirmedNote || null } }) }
      toast.success("Saved"); setForm(null); reload()
    } catch (err) { toastError(err) } finally { setBusy(null) }
  }
  const act = (p: Posting, action: string, ok: string) => { setBusy(p.id); api(`/api/internship-postings/${p.id}/status`, { method: "POST", body: { action } }).then(() => { toast.success(ok); reload() }, toastError).finally(() => setBusy(null)) }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end"><Button onClick={() => setForm({ v: BLANK })}>New posting</Button></div>
      <Table>
        <TableHeader><TableRow><TableHead>Internship</TableHead><TableHead>State</TableHead><TableHead>Deadline</TableHead><TableHead>Applications</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {data.map((p) => <TableRow key={p.id}>
            <TableCell className="font-medium">{p.title}<div className="text-xs font-normal text-muted-foreground">{p.companyName} · {titleCase(p.mode)} · {fmtDate(p.startDate)} to {fmtDate(p.endDate)}</div></TableCell>
            <TableCell><Badge variant={p.status === "OPEN" ? "default" : "outline"}>{titleCase(p.status)}</Badge>{!p.companyConfirmed && <div className="text-xs text-muted-foreground">Company not confirmed</div>}</TableCell>
            <TableCell>{fmtDate(p.applicationDeadline)}</TableCell><TableCell>{p.applications} ({p.selected} selected{p.openings ? ` of ${p.openings}` : ""})</TableCell>
            <TableCell className="flex flex-wrap justify-end gap-1">
              <Button size="sm" variant="outline" onClick={() => setApps(p)}>Applications</Button>
              <Button size="sm" variant="outline" onClick={() => edit(p)}>Edit</Button>
              {(p.status === "DRAFT" || p.status === "CLOSED") && <Button size="sm" disabled={busy === p.id} onClick={() => act(p, "OPEN", "Open to students")}>Open</Button>}
              {p.status === "OPEN" && <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => act(p, "CLOSE", "Closed")}>Close</Button>}
              {p.status !== "CANCELLED" && <Button size="sm" variant="ghost" disabled={busy === p.id} onClick={() => act(p, "CANCEL", "Cancelled")}>Cancel</Button>}
            </TableCell></TableRow>)}
          {data.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No postings yet.</TableCell></TableRow>}
        </TableBody>
      </Table>

      {form && <Dialog open onOpenChange={(o) => !o && setForm(null)}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{form.id ? "Edit posting" : "New internship posting"}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-4"><FieldGroup>
          <Field><FieldLabel htmlFor="ip-t">Role</FieldLabel><Input id="ip-t" required minLength={3} value={form.v.title} onChange={(e) => set({ title: e.target.value })} /></Field>
          <Field><FieldLabel htmlFor="ip-c">Company</FieldLabel><Input id="ip-c" required minLength={2} value={form.v.companyName} onChange={(e) => set({ companyName: e.target.value })} /></Field>
          <Field><FieldLabel htmlFor="ip-d">Description</FieldLabel><Textarea id="ip-d" value={form.v.description} onChange={(e) => set({ description: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-3"><Field><FieldLabel>Mode</FieldLabel><OptionSelect className="w-full" value={form.v.mode} onChange={(x) => set({ mode: x })} options={MODES} placeholder="Mode" /></Field><Field><FieldLabel htmlFor="ip-l">Location</FieldLabel><Input id="ip-l" value={form.v.location} onChange={(e) => set({ location: e.target.value })} /></Field><Field><FieldLabel htmlFor="ip-s">Stipend (₹ a month)</FieldLabel><Input id="ip-s" type="number" min={0} value={form.v.stipendInr} onChange={(e) => set({ stipendInr: e.target.value })} /></Field></div>
          <div className="grid gap-3 sm:grid-cols-3"><Field><FieldLabel htmlFor="ip-a">Applications close</FieldLabel><Input id="ip-a" type="datetime-local" required value={form.v.applicationDeadline} onChange={(e) => set({ applicationDeadline: e.target.value })} /></Field><Field><FieldLabel htmlFor="ip-sd">Starts</FieldLabel><Input id="ip-sd" type="date" required value={form.v.startDate} onChange={(e) => set({ startDate: e.target.value })} /></Field><Field><FieldLabel htmlFor="ip-ed">Ends</FieldLabel><Input id="ip-ed" type="date" required value={form.v.endDate} onChange={(e) => set({ endDate: e.target.value })} /></Field></div>
          <div className="grid gap-3 sm:grid-cols-2"><Field><FieldLabel htmlFor="ip-o">Openings</FieldLabel><Input id="ip-o" type="number" min={1} value={form.v.openings} onChange={(e) => set({ openings: e.target.value })} /></Field><Field><FieldLabel htmlFor="ip-k">Skills, separated by commas</FieldLabel><Input id="ip-k" value={form.v.skills} onChange={(e) => set({ skills: e.target.value })} /></Field></div>
          <div className="grid gap-3 sm:grid-cols-4"><Field><FieldLabel htmlFor="ip-g">Minimum CGPA</FieldLabel><Input id="ip-g" type="number" step="0.01" min={0} max={10} value={form.v.minCgpa} onChange={(e) => set({ minCgpa: e.target.value })} /></Field><Field><FieldLabel htmlFor="ip-10">Minimum 10th %</FieldLabel><Input id="ip-10" type="number" min={0} max={100} value={form.v.minTenthPct} onChange={(e) => set({ minTenthPct: e.target.value })} /></Field><Field><FieldLabel htmlFor="ip-12">Minimum 12th %</FieldLabel><Input id="ip-12" type="number" min={0} max={100} value={form.v.minTwelfthPct} onChange={(e) => set({ minTwelfthPct: e.target.value })} /></Field><Field><FieldLabel htmlFor="ip-b">Most active backlogs</FieldLabel><Input id="ip-b" type="number" min={0} value={form.v.maxActiveBacklogs} onChange={(e) => set({ maxActiveBacklogs: e.target.value })} /></Field></div>
          <div className="flex flex-col gap-1 text-sm"><span className="font-medium">Departments (none ticked = all)</span><div className="flex flex-wrap gap-3">{lk.departments.map((d) => <label key={d.value} className="flex items-center gap-1"><Checkbox checked={form.v.departmentIds.includes(d.value)} onCheckedChange={() => toggle("departmentIds", d.value)} />{d.label}</label>)}</div></div>
          <div className="flex flex-col gap-1 text-sm"><span className="font-medium">Batches (none ticked = all)</span><div className="flex flex-wrap gap-3">{lk.batches.map((d) => <label key={d.value} className="flex items-center gap-1"><Checkbox checked={form.v.batchIds.includes(d.value)} onCheckedChange={() => toggle("batchIds", d.value)} />{d.label}</label>)}</div></div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={form.v.allowPlaced} onCheckedChange={(x) => set({ allowPlaced: x })} />Placed students may apply</label>
          <label className="flex items-center gap-2 text-sm"><Switch checked={form.v.companyConfirmed} onCheckedChange={(x) => set({ companyConfirmed: x })} />The company has confirmed this internship (needed to open it)</label>
          {form.v.companyConfirmed && <Field><FieldLabel htmlFor="ip-n">How the company confirmed (email, call, letter...)</FieldLabel><Input id="ip-n" value={form.v.companyConfirmedNote} onChange={(e) => set({ companyConfirmedNote: e.target.value })} /></Field>}
        </FieldGroup><DialogFooter><Button type="submit" disabled={busy === "save"}>{busy === "save" && <Spinner />}Save</Button></DialogFooter></form></DialogContent></Dialog>}
      {apps && <Dialog open onOpenChange={(o) => !o && setApps(null)}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Applications: {apps.title}</DialogTitle></DialogHeader><Applications postingId={apps.id} /></DialogContent></Dialog>}
    </div>
  )
}

type App = {
  id: string; status: string; selfSourced: boolean; note: string | null; eligibilityGaps: string[]; collegeNote: string | null; companyNote: string | null; createdAt: string; companyName: string | null; role: string | null; startDate: string | null; endDate: string | null; offerLetterUrl?: string | null
  student: { id: string; name: string; enrollmentNo: string; department: { name: string } }; posting?: { id: string; title: string; companyName: string } | null
}
const STATUS_LABEL: Record<string, string> = { APPLIED: "Waiting for the college", COLLEGE_APPROVED: "Waiting for the company", COLLEGE_REJECTED: "Rejected by the college", COMPANY_REJECTED: "Not selected by the company", ALLOTTED: "Selected", WITHDRAWN: "Withdrawn" }

/** The application queue: approve or reject for the college, then record the company's decision. */
export function Applications({ postingId }: { postingId?: string }) {
  const [status, setStatus] = React.useState(postingId ? "" : "APPLIED")
  const { data, reload } = useApi<App[]>("/api/internship-applications", { status: status || undefined, postingId })
  const [dec, setDec] = React.useState<{ app: App; action: string } | null>(null)
  const [note, setNote] = React.useState("")
  const [mentor, setMentor] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const mentors = useApi<{ id: string; name: string }[]>("/api/projects/guides")
  async function send() {
    if (!dec) return; setBusy(true)
    try { await api(`/api/internship-applications/${dec.app.id}/decision`, { method: "POST", body: { action: dec.action, note: note || undefined, ...(mentor ? { facultyMentorId: mentor } : {}) } }); toast.success("Saved and the student was told"); setDec(null); setNote(""); setMentor(""); reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  const opts = [{ value: "", label: "All" }, ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))]
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end"><OptionSelect className="w-60" value={status} onChange={setStatus} options={opts} placeholder="All" /></div>
      {!data ? <Skeleton className="h-32" /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Internship</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {data.map((a) => <TableRow key={a.id}>
              <TableCell>{a.student.name}<div className="text-xs text-muted-foreground">{a.student.enrollmentNo} · {a.student.department.name}</div></TableCell>
              <TableCell>{a.posting ? `${a.posting.title} at ${a.posting.companyName}` : `${a.role} at ${a.companyName}`}{a.selfSourced && <Badge variant="secondary" className="ml-1">Found by the student</Badge>}
                {a.selfSourced && <div className="text-xs text-muted-foreground">{fmtDate(a.startDate)} to {fmtDate(a.endDate)}{a.offerLetterUrl && <> · <a className="underline underline-offset-4" href={a.offerLetterUrl} target="_blank" rel="noreferrer">offer letter</a></>}</div>}
                {a.eligibilityGaps.length > 0 && <div className="text-xs text-destructive">{a.eligibilityGaps.join("; ")}</div>}{a.note && <div className="text-xs text-muted-foreground">“{a.note}”</div>}</TableCell>
              <TableCell>{STATUS_LABEL[a.status] ?? titleCase(a.status)}</TableCell>
              <TableCell className="flex flex-wrap justify-end gap-1">
                {a.status === "APPLIED" && <><Button size="sm" onClick={() => setDec({ app: a, action: "COLLEGE_APPROVE" })}>Approve</Button><Button size="sm" variant="outline" onClick={() => setDec({ app: a, action: "COLLEGE_REJECT" })}>Reject</Button></>}
                {a.status === "COLLEGE_APPROVED" && <><Button size="sm" onClick={() => setDec({ app: a, action: "COMPANY_SELECT" })}>Company selected</Button><Button size="sm" variant="outline" onClick={() => setDec({ app: a, action: "COMPANY_REJECT" })}>Company declined</Button></>}
              </TableCell></TableRow>)}
            {data.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Nothing here.</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}
      {dec && <Dialog open onOpenChange={(o) => !o && setDec(null)}><DialogContent><DialogHeader><DialogTitle>{dec.action === "COLLEGE_APPROVE" ? "Approve for the college" : dec.action === "COLLEGE_REJECT" ? "Reject for the college" : dec.action === "COMPANY_SELECT" ? "The company selected this student" : "The company did not select this student"}: {dec.app.student.name}</DialogTitle></DialogHeader>
        <FieldGroup>
          {dec.action.endsWith("REJECT") && <p className="text-sm text-muted-foreground">The student sees your reason.</p>}
          <Field><FieldLabel htmlFor="d-note">{dec.action.endsWith("REJECT") ? "Reason" : "Note (optional)"}</FieldLabel><Textarea id="d-note" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          {((dec.action === "COMPANY_SELECT") || (dec.action === "COLLEGE_APPROVE" && dec.app.selfSourced)) && <Field><FieldLabel>Faculty mentor (defaults to the student&apos;s mentor)</FieldLabel><OptionSelect className="w-full" value={mentor} onChange={setMentor} options={[{ value: "", label: "The student's own mentor" }, ...(mentors.data ?? []).map((m) => ({ value: m.id, label: m.name }))]} placeholder="The student's own mentor" /></Field>}
          {dec.action === "COMPANY_SELECT" && <Alert><AlertTitle>This creates the internship</AlertTitle><AlertDescription>A student can have only one running at a time.</AlertDescription></Alert>}
        </FieldGroup>
        <DialogFooter><Button variant={dec.action.endsWith("REJECT") ? "destructive" : "default"} disabled={busy || (dec.action.endsWith("REJECT") && note.trim().length < 3)} onClick={send}>{busy && <Spinner />}Confirm</Button></DialogFooter></DialogContent></Dialog>}
    </div>
  )
}

type Sum = {
  postings: { open: number; draft: number; closed: number }; applications: { waitingForCollege: number; waitingForCompany: number; selected: number; rejected: number; withdrawn: number }
  internships: { allotted: number; ongoing: number; completed: number; terminated: number }; averageAttendancePercent: number | null; lowAttendance: { id: string; name: string; percent: number | null }[]
  averageEvaluation: number | null; toReview: { logs: number; tasks: number; certificates: number }; certificatesVerifiedPercent: number | null; ppo: { completed: number; offered: number; accepted: number; offeredPercent: number | null; conversionPercent: number | null }
}
const Stat = ({ label, value }: { label: string; value: React.ReactNode }) => <Card size="sm"><CardHeader><CardDescription>{label}</CardDescription><CardTitle className="text-2xl">{value}</CardTitle></CardHeader></Card>

export function InternshipOverview() {
  const { data: s } = useApi<Sum>("/api/internships/summary")
  if (!s) return <Skeleton className="h-48" />
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Open postings" value={s.postings.open} /><Stat label="Waiting for the college" value={s.applications.waitingForCollege} /><Stat label="Waiting for the company" value={s.applications.waitingForCompany} /><Stat label="Selected" value={s.applications.selected} />
        <Stat label="Ongoing" value={s.internships.ongoing} /><Stat label="Completed" value={s.internships.completed} /><Stat label="Average attendance" value={s.averageAttendancePercent === null ? "—" : `${s.averageAttendancePercent}%`} /><Stat label="Average evaluation" value={s.averageEvaluation ?? "—"} />
        <Stat label="Logs to review" value={s.toReview.logs} /><Stat label="Tasks to review" value={s.toReview.tasks} /><Stat label="Certificates to verify" value={s.toReview.certificates} /><Stat label="Certificates verified" value={s.certificatesVerifiedPercent === null ? "—" : `${s.certificatesVerifiedPercent}%`} />
      </div>
      <Card size="sm"><CardHeader><CardTitle>Pre-placement offers</CardTitle><CardDescription>Of {s.ppo.completed} completed internships: {s.ppo.offered} led to an offer{s.ppo.offeredPercent !== null ? ` (${s.ppo.offeredPercent}%)` : ""} and {s.ppo.accepted} were accepted{s.ppo.conversionPercent !== null ? ` (${s.ppo.conversionPercent}% conversion)` : ""}.</CardDescription></CardHeader></Card>
      {s.lowAttendance.length > 0 && <Card size="sm"><CardHeader><CardTitle>Attendance under 75%</CardTitle></CardHeader><CardContent className="flex flex-col gap-1 text-sm">{s.lowAttendance.map((x) => <a key={x.id} className="flex justify-between underline-offset-4 hover:underline" href={`/staff/internships/${x.id}`}><span>{x.name}</span><span className="text-muted-foreground">{x.percent}%</span></a>)}</CardContent></Card>}
    </div>
  )
}
