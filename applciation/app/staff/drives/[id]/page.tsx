"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { DataView } from "@/components/section-review"
import { DrivePipeline } from "@/components/drive-pipeline"
import { DriveFeedbackTab, NonApplicantsTab, ResultsUploadButton } from "@/components/staff-extras"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api, download, toastError } from "@/lib/web/api"
import { isCoordinatorOnly, useAuth } from "@/lib/web/auth"
import { ROUND_RESULT } from "@/lib/web/enums"
import { fmtDate, fmtDateTime, fmtLpa, statusVariant, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Drive = {
  id: string; role: string; jobType: string; status: string; location: string | null; venue: string | null; description: string | null
  packageMinLpa: number | string | null; packageMaxLpa: number | string | null; applicationDeadline: string; driveDate: string
  minCgpa: number | string | null; minTenthPct: number | string | null; minTwelfthPct: number | string | null; maxActiveBacklogs: number | null; allowPlaced: boolean
  company: { id: string; name: string; tier: string }; rounds: { id: string; order: number; type: string; scheduledAt: string | null; venue: string | null }[]
  documents: { id: string; fileName: string; url: string | null }[]; _count: { applications: number; exceptions: number }
}
type Elig = { counts: { eligible: number; ineligible: number; viaException: number }; items: { studentId: string; name: string; enrollmentNo: string; eligible: boolean; viaException: boolean; blocked: boolean; reasons: string[] }[] }
type App = { id: string; status: string; appliedAt: string; student: { id: string; name: string; enrollmentNo: string; cgpa: number | null } }
type Cand = { round: { id: string; order: number; type: string }; items: { id: string; status: string; student: { id: string; name: string; enrollmentNo: string }; result: { status: string; score: number | null } | null }[] }

export default function DrivePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { state } = useAuth()
  const canEdit = state.status === "ready" && !isCoordinatorOnly(state.profile)
  const d = useApi<Drive>(`/api/drives/${id}`)
  const [tab, setTab] = React.useState("overview")
  const [confirm, setConfirm] = React.useState<"publish" | "close" | "cancel" | null>(null)
  const [busy, setBusy] = React.useState(false)

  if (d.error) return <Alert variant="destructive"><AlertTitle>Could not load this drive</AlertTitle><AlertDescription>{d.error instanceof Error ? d.error.message : "Try again"}</AlertDescription></Alert>
  if (!d.data) return <Skeleton className="h-64" />
  const drive = d.data

  async function run(action: "publish" | "close" | "cancel") {
    setBusy(true)
    try { await api(`/api/drives/${id}/${action}`, { method: "POST" }); toast.success(`Drive ${action === "publish" ? "published" : action === "close" ? "closed" : "cancelled"}`); setConfirm(null); d.reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  async function duplicate() {
    try { const n = await api<{ id: string }>(`/api/drives/${id}/duplicate`, { method: "POST" }); toast.success("Copy created as a draft"); router.push(`/staff/drives/${n.id}`) } catch (e) { toastError(e) }
  }
  const live = drive.status === "PUBLISHED"

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{drive.company.name}: {drive.role}</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-2">
            <Badge variant={live ? "default" : drive.status === "CANCELLED" ? "destructive" : "secondary"}>{titleCase(drive.status)}</Badge>
            <Badge variant="outline">{titleCase(drive.jobType)}</Badge>
            <Badge variant="outline">{titleCase(drive.company.tier)}</Badge>
            <span>Deadline {fmtDateTime(drive.applicationDeadline)} · Drive {fmtDate(drive.driveDate)}</span>
          </CardDescription>
        </CardHeader>
        {canEdit && (
          <CardContent className="flex flex-wrap gap-2">
            {drive.status === "DRAFT" && <Button onClick={() => setConfirm("publish")}>Publish</Button>}
            {live && <Button variant="outline" onClick={() => setConfirm("close")}>Close applications</Button>}
            {(drive.status === "DRAFT" || live) && <Button variant="outline" onClick={() => setConfirm("cancel")}>Cancel drive</Button>}
            <Button variant="outline" onClick={duplicate}>Duplicate</Button>
            {state.status === "ready" && state.profile.modules.includes("ATTENDANCE_BLOCKING") && <><Button variant="outline" render={<Link href={`/staff/drives/${id}/attendance`} />}>Attendance</Button><Button variant="outline" render={<Link href={`/staff/drives/${id}/interviews`} />}>Interviews</Button></>}
          </CardContent>
        )}
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="eligibility">Eligibility</TabsTrigger>
          <TabsTrigger value="applications">Applications ({drive._count.applications})</TabsTrigger><TabsTrigger value="pipeline">Placement status</TabsTrigger>
          {drive.status === "PUBLISHED" && <TabsTrigger value="pending">Not applied</TabsTrigger>}
          {canEdit && <TabsTrigger value="rounds">Rounds and results</TabsTrigger>}
          {canEdit && <TabsTrigger value="feedback">Company feedback</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="grid gap-4 lg:grid-cols-2">
          <Card><CardHeader><CardTitle>Details</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-muted-foreground">Package</span><span>{drive.packageMinLpa || drive.packageMaxLpa ? `${fmtLpa(drive.packageMinLpa)} to ${fmtLpa(drive.packageMaxLpa)}` : "—"}</span>
            <span className="text-muted-foreground">Location</span><span>{drive.location ?? "—"}</span>
            <span className="text-muted-foreground">Venue</span><span>{drive.venue ?? "—"}</span>
            <span className="text-muted-foreground">Minimum CGPA</span><span>{drive.minCgpa ?? "—"}</span>
            <span className="text-muted-foreground">Minimum 10th / 12th</span><span>{drive.minTenthPct ?? "—"} / {drive.minTwelfthPct ?? "—"}</span>
            <span className="text-muted-foreground">Max active backlogs</span><span>{drive.maxActiveBacklogs ?? "—"}</span>
            <span className="text-muted-foreground">Placed students may apply</span><span>{drive.allowPlaced ? "Yes" : "No"}</span>
            {drive.description && <><span className="text-muted-foreground">Description</span><span className="whitespace-pre-wrap">{drive.description}</span></>}
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Rounds</CardTitle></CardHeader><CardContent className="flex flex-col gap-2 text-sm">
            {drive.rounds.map((r) => <div key={r.id} className="flex justify-between gap-2"><span>{r.order}. {titleCase(r.type)}</span><span className="text-muted-foreground">{fmtDateTime(r.scheduledAt)}{r.venue ? ` · ${r.venue}` : ""}</span></div>)}
            {drive.rounds.length === 0 && <span className="text-muted-foreground">No rounds added.</span>}
            {drive.documents.map((x) => <a key={x.id} className="underline underline-offset-4" href={x.url ?? "#"} target="_blank" rel="noreferrer">{x.fileName}</a>)}
            {canEdit && <div className="flex items-center gap-2 pt-2"><Input type="file" accept=".pdf,.doc,.docx,.png,.jpg" aria-label="Attach a document" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; const body = new FormData(); body.set("file", file); try { await api(`/api/drives/${id}/documents`, { method: "POST", body }); toast.success("Document attached"); d.reload() } catch (err) { toastError(err) } e.target.value = "" }} /></div>}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="eligibility"><EligibilityTab driveId={id} canEdit={canEdit} /></TabsContent>
        <TabsContent value="pipeline"><DrivePipeline driveId={id} /></TabsContent>
        <TabsContent value="applications"><ApplicationsTab driveId={id} canEdit={canEdit} onChanged={d.reload} /></TabsContent>
        {drive.status === "PUBLISHED" && <TabsContent value="pending"><NonApplicantsTab driveId={id} canEdit={canEdit} /></TabsContent>}
        {canEdit && <TabsContent value="feedback"><DriveFeedbackTab driveId={id} /></TabsContent>}
        {canEdit && <TabsContent value="rounds"><RoundsTab driveId={id} rounds={drive.rounds} /></TabsContent>}
      </Tabs>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "publish" ? "Publish this drive?" : confirm === "close" ? "Close applications?" : "Cancel this drive?"}</AlertDialogTitle>
            <AlertDialogDescription>{confirm === "publish" ? "Eligible students will be able to see and apply to it." : confirm === "close" ? "Students will no longer be able to apply." : "Students are told it is cancelled. This cannot be undone."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); if (confirm) void run(confirm) }}>{busy && <Spinner />}Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function EligibilityTab({ driveId, canEdit }: { driveId: string; canEdit: boolean }) {
  const [status, setStatus] = React.useState("eligible")
  const { data, loading, reload } = useApi<Elig>(`/api/drives/${driveId}/eligibility`, { status, limit: 200 })
  const [exc, setExc] = React.useState<{ studentId: string; name: string } | null>(null)
  const [reason, setReason] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  async function addException() {
    if (!exc) return
    setBusy(true)
    try {
      const r = await api<{ approvalRequired?: boolean }>(`/api/drives/${driveId}/exceptions`, { method: "POST", body: { studentId: exc.studentId, reason: reason.trim() } })
      toast.success(r?.approvalRequired ? "Sent for approval" : "Exception added")
      setExc(null); setReason(""); reload()
    } catch (e) { toastError(e) } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {data && <><Badge>{data.counts.eligible} eligible</Badge><Badge variant="secondary">{data.counts.ineligible} not eligible</Badge>{data.counts.viaException > 0 && <Badge variant="outline">{data.counts.viaException} via exception</Badge>}</>}
        <OptionSelect className="ml-auto w-40" value={status} onChange={setStatus} options={[{ value: "eligible", label: "Eligible" }, { value: "ineligible", label: "Not eligible" }, { value: "all", label: "Everyone" }]} placeholder="Show" />
        <Button variant="outline" onClick={() => download(`/api/drives/${driveId}/eligibility/export`).catch(toastError)}>Export</Button>
      </div>
      {loading && !data ? <Skeleton className="h-40" /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Result</TableHead><TableHead>Why</TableHead>{canEdit && <TableHead className="text-right">Exception</TableHead>}</TableRow></TableHeader>
          <TableBody>
            {data?.items.map((s) => (
              <TableRow key={s.studentId}>
                <TableCell>{s.name}<div className="text-xs text-muted-foreground">{s.enrollmentNo}</div></TableCell>
                <TableCell><Badge variant={s.eligible ? "default" : "secondary"}>{s.eligible ? (s.viaException ? "Eligible (exception)" : "Eligible") : s.blocked ? "Blocked" : "Not eligible"}</Badge></TableCell>
                <TableCell className="text-muted-foreground">{s.reasons.join("; ") || "—"}</TableCell>
                {canEdit && <TableCell className="text-right">{!s.eligible && !s.blocked && <Button size="sm" variant="outline" onClick={() => setExc({ studentId: s.studentId, name: s.name })}>Allow</Button>}</TableCell>}
              </TableRow>
            ))}
            {data?.items.length === 0 && <TableRow><TableCell colSpan={4} className="text-muted-foreground">No students in this list.</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}
      <Dialog open={!!exc} onOpenChange={(o) => !o && setExc(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Allow {exc?.name} to apply</DialogTitle><DialogDescription>The exception and your reason are logged.</DialogDescription></DialogHeader>
          <Field><FieldLabel htmlFor="exc-reason">Reason</FieldLabel><Textarea id="exc-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <DialogFooter><Button disabled={busy || reason.trim().length < 5} onClick={addException}>{busy && <Spinner />}Add exception</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ApplicationsTab({ driveId, canEdit, onChanged }: { driveId: string; canEdit: boolean; onChanged: () => void }) {
  const { data, loading, reload } = useApi<App[]>(`/api/drives/${driveId}/applications`)
  const [sel, setSel] = React.useState<Set<string>>(new Set())
  const [busy, setBusy] = React.useState(false)
  const [offerFor, setOfferFor] = React.useState<App | null>(null)
  const [resumeFor, setResumeFor] = React.useState<App | null>(null)

  async function decide(status: "SHORTLISTED" | "ON_HOLD" | "REJECTED") {
    setBusy(true)
    try {
      const r = await api<{ approvalRequired?: boolean }>(`/api/drives/${driveId}/applications/decide`, { method: "POST", body: { applicationIds: [...sel], status } })
      toast.success(r?.approvalRequired ? "Sent for approval" : "Updated"); setSel(new Set()); reload(); onChanged()
    } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  const toggle = (id: string, on: boolean) => setSel((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {canEdit && sel.size > 0 && (["SHORTLISTED", "ON_HOLD", "REJECTED"] as const).map((s) => <Button key={s} variant="outline" disabled={busy} onClick={() => decide(s)}>{titleCase(s)} ({sel.size})</Button>)}
        <Button variant="outline" className="ml-auto" onClick={() => download(`/api/drives/${driveId}/applications/export`).catch(toastError)}>Export</Button>
      </div>
      {loading && !data ? <Skeleton className="h-40" /> : (
        <Table>
          <TableHeader><TableRow>{canEdit && <TableHead className="w-8"><Checkbox checked={!!data?.length && sel.size === data.length} onCheckedChange={(on) => setSel(on ? new Set((data ?? []).map((a) => a.id)) : new Set())} aria-label="Select all" /></TableHead>}<TableHead>Student</TableHead><TableHead>CGPA</TableHead><TableHead>Applied</TableHead><TableHead>Status</TableHead>{canEdit && <TableHead className="text-right">Offer</TableHead>}</TableRow></TableHeader>
          <TableBody>
            {data?.map((a) => (
              <TableRow key={a.id}>
                {canEdit && <TableCell><Checkbox checked={sel.has(a.id)} onCheckedChange={(on) => toggle(a.id, !!on)} aria-label={`Select ${a.student.name}`} /></TableCell>}
                <TableCell>{a.student.name}<div className="text-xs text-muted-foreground">{a.student.enrollmentNo}</div></TableCell>
                <TableCell>{a.student.cgpa ?? "—"}</TableCell>
                <TableCell>{fmtDate(a.appliedAt)}</TableCell>
                <TableCell><Badge variant={statusVariant(a.status)}>{titleCase(a.status)}</Badge></TableCell>
                <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => setResumeFor(a)}>Resume</Button>{canEdit && <Button size="sm" variant="outline" onClick={() => setOfferFor(a)}>Make offer</Button>}</TableCell>
              </TableRow>
            ))}
            {data?.length === 0 && <TableRow><TableCell colSpan={6} className="text-muted-foreground">No applications yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}
      <ResumeDialog driveId={driveId} app={resumeFor} onClose={() => setResumeFor(null)} />
      <OfferDialog app={offerFor} onClose={() => setOfferFor(null)} onDone={() => { setOfferFor(null); reload() }} />
    </div>
  )
}

function OfferDialog({ app, onClose, onDone }: { app: App | null; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false)
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setBusy(true)
    try {
      const r = await api<{ approvalRequired?: boolean }>("/api/offers", { method: "POST", body: { applicationId: app!.id, packageLpa: Number(f.get("package")), isPpo: !!f.get("ppo") } })
      toast.success(r?.approvalRequired ? "Offer sent for approval" : "Offer created"); onDone()
    } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  return (
    <Dialog open={!!app} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Make an offer to {app?.student.name}</DialogTitle><DialogDescription>College rules, such as the offer limit, are checked when you save.</DialogDescription></DialogHeader>
        <form onSubmit={submit}>
          <FieldGroup>
            <Field><FieldLabel htmlFor="package">Package (LPA)</FieldLabel><Input id="package" name="package" type="number" step="0.1" min={0.1} required /></Field>
            <label className="flex items-center gap-2 text-sm"><Checkbox name="ppo" />Pre-placement offer from an internship</label>
          </FieldGroup>
          <DialogFooter className="mt-4"><Button type="submit" disabled={busy}>{busy && <Spinner />}Create offer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RoundsTab({ driveId, rounds }: { driveId: string; rounds: Drive["rounds"] }) {
  const [roundId, setRoundId] = React.useState(rounds[0]?.id ?? "")
  const { data, loading, reload } = useApi<Cand>(roundId ? `/api/drives/${driveId}/rounds/${roundId}/candidates` : null)
  const [sel, setSel] = React.useState<Set<string>>(new Set())
  const [busy, setBusy] = React.useState(false)
  if (rounds.length === 0) return <Alert><AlertTitle>No rounds</AlertTitle><AlertDescription>Add rounds to this drive to record results.</AlertDescription></Alert>

  async function mark(status: string) {
    setBusy(true)
    try {
      const r = await api<{ approvalRequired?: boolean }>(`/api/drives/${driveId}/rounds/${roundId}/results`, { method: "POST", body: { results: [...sel].map((applicationId) => ({ applicationId, status })) } })
      toast.success(r?.approvalRequired ? "Sent for approval" : "Results recorded"); setSel(new Set()); reload()
    } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  const toggle = (id: string, on: boolean) => setSel((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <OptionSelect className="w-56" value={roundId} onChange={(v) => { setRoundId(v); setSel(new Set()) }} options={rounds.map((r) => ({ value: r.id, label: `Round ${r.order}: ${titleCase(r.type)}` }))} placeholder="Round" />
        {sel.size > 0 && ROUND_RESULT.map((o) => <Button key={o.value} variant="outline" disabled={busy} onClick={() => mark(o.value)}>{o.label} ({sel.size})</Button>)}
        <span className="ml-auto" /><ResultsUploadButton driveId={driveId} roundId={roundId} onDone={reload} />
        <Button variant="outline" onClick={() => download(`/api/drives/${driveId}/rounds/${roundId}/shortlist-export`).catch(toastError)}>Export shortlist</Button>
      </div>
      {loading && !data ? <Skeleton className="h-40" /> : (
        <Table>
          <TableHeader><TableRow><TableHead className="w-8"><Checkbox checked={!!data?.items.length && sel.size === data.items.length} onCheckedChange={(on) => setSel(on ? new Set((data?.items ?? []).map((a) => a.id)) : new Set())} aria-label="Select all" /></TableHead><TableHead>Student</TableHead><TableHead>Application</TableHead><TableHead>Result in this round</TableHead></TableRow></TableHeader>
          <TableBody>
            {data?.items.map((a) => (
              <TableRow key={a.id}>
                <TableCell><Checkbox checked={sel.has(a.id)} onCheckedChange={(on) => toggle(a.id, !!on)} aria-label={`Select ${a.student.name}`} /></TableCell>
                <TableCell>{a.student.name}<div className="text-xs text-muted-foreground">{a.student.enrollmentNo}</div></TableCell>
                <TableCell><Badge variant={statusVariant(a.status)}>{titleCase(a.status)}</Badge></TableCell>
                <TableCell>{a.result ? <Badge variant={statusVariant(a.result.status)}>{titleCase(a.result.status)}{a.result.score !== null ? ` (${a.result.score})` : ""}</Badge> : <span className="text-muted-foreground">Not marked</span>}</TableCell>
              </TableRow>
            ))}
            {data?.items.length === 0 && <TableRow><TableCell colSpan={4} className="text-muted-foreground">No shortlisted students in this round yet. Shortlist applicants first.</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

/** The resume an applicant sent, as it was when they applied. */
function ResumeDialog({ driveId, app, onClose }: { driveId: string; app: App | null; onClose: () => void }) {
  const { data } = useApi<{ student: string; appliedAt: string; snapshot: unknown; file: { name: string; url: string | null } | null }>(app ? `/api/drives/${driveId}/applications/${app.id}/resume` : null)
  return (
    <Dialog open={!!app} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>{app?.student.name}: resume sent</DialogTitle><DialogDescription>{data ? `As it was on ${fmtDate(data.appliedAt)}` : "Loading"}</DialogDescription></DialogHeader>
        {!data ? <Skeleton className="h-24" /> : (
          <div className="flex flex-col gap-3 text-sm">
            {data.file && <div>Uploaded file: {data.file.url ? <a className="underline underline-offset-4" href={data.file.url} target="_blank" rel="noreferrer">{data.file.name}</a> : data.file.name}</div>}
            {data.snapshot ? <DataView value={data.snapshot} /> : <span className="text-muted-foreground">No saved profile data (this student applied before resumes were saved).</span>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
