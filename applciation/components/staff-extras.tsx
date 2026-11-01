"use client"

import * as React from "react"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { api, download, toastError } from "@/lib/web/api"
import { fmtDateTime, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

/** Eligible students who have not applied, with a reminder email to all of them. */
export function NonApplicantsTab({ driveId, canEdit }: { driveId: string; canEdit: boolean }) {
  const { data, loading, reload } = useApi<{ count: number; items: { studentId: string; name: string; enrollmentNo: string }[] }>(`/api/drives/${driveId}/non-applicants`)
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [subject, setSubject] = React.useState("")
  const [message, setMessage] = React.useState("")
  async function send() {
    setBusy(true)
    try {
      const r = await api<{ approvalRequired?: boolean }>(`/api/drives/${driveId}/reminders`, { method: "POST", body: { ...(subject.trim() ? { subject: subject.trim() } : {}), ...(message.trim() ? { message: message.trim() } : {}) } })
      toast.success(r?.approvalRequired ? "Sent for approval" : "Reminder sent"); setOpen(false); reload()
    } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  if (loading && !data) return <Skeleton className="h-40" />
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">{data?.count ?? 0} eligible students have not applied yet.</span>
        {canEdit && <Button className="ml-auto" disabled={!data?.count} onClick={() => setOpen(true)}>Send reminder</Button>}
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Enrollment no</TableHead></TableRow></TableHeader>
        <TableBody>
          {data?.items.map((s) => <TableRow key={s.studentId}><TableCell>{s.name}</TableCell><TableCell>{s.enrollmentNo}</TableCell></TableRow>)}
          {data?.items.length === 0 && <TableRow><TableCell colSpan={2} className="text-muted-foreground">Everyone eligible has applied.</TableCell></TableRow>}
        </TableBody>
      </Table>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remind {data?.count ?? 0} students</DialogTitle><DialogDescription>Leave both blank to send the standard reminder with the deadline.</DialogDescription></DialogHeader>
          <FieldGroup>
            <Field><FieldLabel htmlFor="rs">Subject</FieldLabel><Input id="rs" value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
            <Field><FieldLabel htmlFor="rm">Message</FieldLabel><Textarea id="rm" rows={5} value={message} onChange={(e) => setMessage(e.target.value)} /></Field>
          </FieldGroup>
          <DialogFooter><Button disabled={busy} onClick={send}>{busy && <Spinner />}Send</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Upload a spreadsheet of round results: enrollment_no, result, score, remarks. */
export function ResultsUploadButton({ driveId, roundId, onDone }: { driveId: string; roundId: string; onDone: () => void }) {
  const ref = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)
  async function pick(file?: File) {
    if (!file) return
    setBusy(true)
    try {
      const fd = new FormData(); fd.set("file", file)
      const r = await api<{ approvalRequired?: boolean; rowErrors?: { row: number; reason: string }[] }>(`/api/drives/${driveId}/rounds/${roundId}/results/upload`, { method: "POST", body: fd })
      toast.success(r?.approvalRequired ? "Sent for approval" : "Results recorded", { description: r?.rowErrors?.length ? `${r.rowErrors.length} rows skipped, first: ${r.rowErrors[0].reason}` : undefined })
      onDone()
    } catch (e) { toastError(e) } finally { setBusy(false); if (ref.current) ref.current.value = "" }
  }
  return (
    <>
      <input ref={ref} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      <Button variant="outline" disabled={busy} onClick={() => ref.current?.click()}>{busy && <Spinner />}Upload results</Button>
    </>
  )
}

/** What the company told us after the drive. */
export function DriveFeedbackTab({ driveId }: { driveId: string }) {
  const { data } = useApi<Fb>(`/api/drives/${driveId}/feedback`)
  if (!data) return <Skeleton className="h-48" />
  return <FeedbackForm driveId={driveId} initial={{ onStudents: data.onStudents ?? "", onProcess: data.onProcess ?? "", improvements: data.improvements ?? "" }} />
}

type Fb = { onStudents: string | null; onProcess: string | null; improvements: string | null }

function FeedbackForm({ driveId, initial }: { driveId: string; initial: { onStudents: string; onProcess: string; improvements: string } }) {
  const [v, setV] = React.useState(initial)
  const [busy, setBusy] = React.useState(false)
  async function save() {
    setBusy(true)
    try { await api(`/api/drives/${driveId}/feedback`, { method: "PUT", body: v }); toast.success("Feedback saved") } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value })
  return (
    <Card>
      <CardHeader><CardTitle>Company feedback</CardTitle><CardDescription>Record this after the drive has taken place.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FieldGroup>
          <Field><FieldLabel htmlFor="f1">On the students</FieldLabel><Textarea id="f1" rows={3} value={v.onStudents} onChange={set("onStudents")} /></Field>
          <Field><FieldLabel htmlFor="f2">On the process</FieldLabel><Textarea id="f2" rows={3} value={v.onProcess} onChange={set("onProcess")} /></Field>
          <Field><FieldLabel htmlFor="f3">To improve next year</FieldLabel><Textarea id="f3" rows={3} value={v.improvements} onChange={set("improvements")} /></Field>
        </FieldGroup>
        <Button className="self-start" disabled={busy} onClick={save}>{busy && <Spinner />}Save feedback</Button>
      </CardContent>
    </Card>
  )
}

/** Who verified what and when. */
export function VerificationHistory({ studentId }: { studentId: string }) {
  const { data, loading } = useApi<{ id: string; section: string; action: string; comment: string | null; createdAt: string; actor: { name: string } | null }[]>(`/api/students/${studentId}/verification-history`)
  if (loading && !data) return <Skeleton className="h-24" />
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-medium">Verification history</h3>
      <Table>
        <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Section</TableHead><TableHead>Action</TableHead><TableHead>By</TableHead><TableHead>Comment</TableHead></TableRow></TableHeader>
        <TableBody>
          {data?.map((e) => <TableRow key={e.id}><TableCell>{fmtDateTime(e.createdAt)}</TableCell><TableCell>{titleCase(e.section)}</TableCell><TableCell><Badge variant="outline">{titleCase(e.action)}</Badge></TableCell><TableCell>{e.actor?.name ?? "—"}</TableCell><TableCell>{e.comment ?? "—"}</TableCell></TableRow>)}
          {data?.length === 0 && <TableRow><TableCell colSpan={5} className="text-muted-foreground">Nothing reviewed yet.</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  )
}

const ROUND_TYPES = ["APTITUDE", "CODING", "GROUP_DISCUSSION", "TECHNICAL", "HR", "OTHER"].map((v) => ({ value: v, label: titleCase(v) }))

/** The students behind the elimination charts, with the same filters. */
export function EliminationStudents({ departmentId, batchId, driveId }: { departmentId?: string; batchId?: string; driveId?: string }) {
  const [roundType, setRoundType] = React.useState("")
  const q = { roundType, departmentId, batchId, driveId }
  const { data, loading } = useApi<{ studentId?: string; enrollmentNo: string; name: string; times: number; roundTypes: string[] }[]>("/api/analytics/elimination/students", q)
  return (
    <Card>
      <CardHeader><CardTitle>Students behind the numbers</CardTitle><CardDescription>Everyone rejected at least once, with the filters above.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <OptionSelect className="w-52" value={roundType} onChange={setRoundType} options={[{ value: "", label: "Any round type" }, ...ROUND_TYPES]} placeholder="Round type" />
          <Button variant="outline" className="ml-auto" onClick={() => download("/api/analytics/elimination/students", { query: { ...q, format: "xlsx" } }).catch(toastError)}>Export</Button>
        </div>
        {loading && !data ? <Skeleton className="h-32" /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Times rejected</TableHead><TableHead>Round types</TableHead></TableRow></TableHeader>
            <TableBody>
              {data?.map((r) => <TableRow key={r.enrollmentNo}><TableCell>{r.name}<div className="text-xs text-muted-foreground">{r.enrollmentNo}</div></TableCell><TableCell>{r.times}</TableCell><TableCell>{r.roundTypes.map(titleCase).join(", ")}</TableCell></TableRow>)}
              {data?.length === 0 && <TableRow><TableCell colSpan={3} className="text-muted-foreground">Nobody matches.</TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

type Prospect = { id: string; companyName: string; contactPhone: string | null; notes: string | null; activities: { id: string; kind: string; body: string; createdAt: string }[] }

/** A prospect's conversation log: add a call, email, meeting or note and set the next follow-up. */
export function ProspectDialog({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { data, reload } = useApi<Prospect>(id ? `/api/crm/prospects/${id}` : null)
  const [kind, setKind] = React.useState("NOTE")
  const [body, setBody] = React.useState("")
  const [next, setNext] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  async function add() {
    setBusy(true)
    try {
      await api(`/api/crm/prospects/${id}/activities`, { method: "POST", body: { kind, body: body.trim(), ...(next ? { nextFollowUpAt: new Date(`${next}T09:00:00`).toISOString() } : {}) } })
      setBody(""); setNext(""); reload(); onChanged()
    } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{data?.companyName ?? "Prospect"}</DialogTitle><DialogDescription>Log what happened and when to follow up.</DialogDescription></DialogHeader>
        <FieldGroup>
          <div className="grid grid-cols-2 gap-2">
            <Field><FieldLabel>Type</FieldLabel><OptionSelect value={kind} onChange={setKind} options={["NOTE", "CALL", "EMAIL", "MEETING"].map((v) => ({ value: v, label: titleCase(v) }))} placeholder="Type" /></Field>
            <Field><FieldLabel htmlFor="nf">Next follow-up</FieldLabel><Input id="nf" type="date" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
          </div>
          <Field><FieldLabel htmlFor="ab">What happened</FieldLabel><Textarea id="ab" rows={3} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
          <Button className="self-start" disabled={busy || !body.trim()} onClick={add}>{busy && <Spinner />}Add to log</Button>
        </FieldGroup>
        <div className="flex flex-col gap-2 text-sm">
          {data?.activities.map((a) => <div key={a.id} className="rounded-lg border p-2"><div className="flex items-center gap-2"><Badge variant="outline">{titleCase(a.kind)}</Badge><span className="text-xs text-muted-foreground">{fmtDateTime(a.createdAt)}</span></div><p className="mt-1 whitespace-pre-wrap">{a.body}</p></div>)}
          {data?.activities.length === 0 && <span className="text-muted-foreground">Nothing logged yet.</span>}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Views and clicks for one job alert. */
export function JobAlertStats({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data } = useApi<{ audience: number; views: number; uniqueViewers: number; clicks: number; uniqueClickers: number; interested?: number }>(id ? `/api/job-alerts/${id}/stats` : null)
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Reach</DialogTitle><DialogDescription>How many of the targeted students saw and used this alert.</DialogDescription></DialogHeader>
        {!data ? <Skeleton className="h-20" /> : (
          <div className="grid grid-cols-4 gap-2 text-center">
            <Card size="sm"><CardHeader><CardDescription>Targeted</CardDescription><CardTitle className="text-2xl">{data.audience}</CardTitle></CardHeader></Card>
            <Card size="sm"><CardHeader><CardDescription>Viewed</CardDescription><CardTitle className="text-2xl">{data.uniqueViewers}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">{data.views} views</CardContent></Card>
            <Card size="sm"><CardHeader><CardDescription>Interested</CardDescription><CardTitle className="text-2xl">{data.interested ?? 0}</CardTitle></CardHeader></Card>
            <Card size="sm"><CardHeader><CardDescription>Clicked apply</CardDescription><CardTitle className="text-2xl">{data.uniqueClickers}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">{data.clicks} clicks</CardContent></Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
