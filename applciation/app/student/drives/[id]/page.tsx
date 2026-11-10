"use client"

import * as React from "react"
import { useParams } from "next/navigation"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BookmarkIcon } from "lucide-react"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { api, toastError } from "@/lib/web/api"
import { useAuth } from "@/lib/web/auth"
import { countdown, fmtDate, fmtDateTime, fmtLpa, statusVariant, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Drive = {
  id: string; role: string; jobType: string; status: string; location: string | null; venue: string | null; description: string | null
  packageMinLpa: number | string | null; packageMaxLpa: number | string | null; driveDate: string; applicationDeadline: string
  company: { name: string; tier: string; industry: string | null; website: string | null }
  rounds: { id: string; order: number; type: string; scheduledAt: string | null; venue: string | null }[]
  documents: { id: string; fileName: string; url: string | null }[]
  requirements?: { mandatory: { kind: string; text: string }[]; preferred: { kind: string; text: string }[]; experience: string | null; selectionProcess: string[]; other: string | null } | null
  rules: { minCgpa: number | string | null; minTenthPct: number | string | null; minTwelfthPct: number | string | null; maxActiveBacklogs: number | null; allowPlaced: boolean }
  saved: boolean; myApplication: { id: string; status: string; appliedAt: string } | null
  eligibility: { eligible: boolean; blocked: boolean; reasons: string[] }
}

export default function StudentDrivePage() {
  const { id } = useParams<{ id: string }>()
  const { state } = useAuth()
  const hasOnboarding = state.status === "ready" && state.profile.modules.includes("ONBOARDING")
  const hasAttendance = state.status === "ready" && state.profile.modules.includes("ATTENDANCE_BLOCKING")
  const { data, reload } = useApi<Drive>(`/api/student/drives/${id}`)
  const [busy, setBusy] = React.useState(false)
  const [code, setCode] = React.useState("")
  const [now] = React.useState(() => Date.now())
  const resumes = useApi<{ documents: { id: string; fileName: string }[] }>(hasOnboarding ? "/api/student/sections/RESUME" : null)
  const [resumeId, setResumeId] = React.useState("")
  if (!data) return <Skeleton className="h-64" />
  const d = data
  const open = d.status === "PUBLISHED" && new Date(d.applicationDeadline) > new Date()

  async function act(path: "apply" | "withdraw") {
    setBusy(true)
    try { await api(`/api/student/drives/${id}/${path}`, { method: "POST", ...(path === "apply" && resumeId ? { body: { resumeDocumentId: resumeId } } : {}) }); toast.success(path === "apply" ? "Application sent" : "Application withdrawn"); reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  async function checkIn() {
    setBusy(true)
    try { await api("/api/student/attendance/check-in", { method: "POST", body: { driveId: id, code: code.trim() } }); toast.success("You are checked in"); setCode("") } catch (e) { toastError(e) } finally { setBusy(false) }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">{d.company.name}: {d.role}<Button size="icon-sm" variant="ghost" className="ml-auto" aria-label={d.saved ? "Remove from saved" : "Save for later"} onClick={async () => { try { await api(`/api/student/drives/${id}/save`, { method: d.saved ? "DELETE" : "POST" }); reload() } catch (e) { toastError(e) } }}><BookmarkIcon className={d.saved ? "fill-current" : ""} /></Button></CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-2"><Badge variant="outline">{titleCase(d.jobType)}</Badge>{d.packageMinLpa || d.packageMaxLpa ? <span>{fmtLpa(d.packageMinLpa)} to {fmtLpa(d.packageMaxLpa)}</span> : null}<span>Apply by {fmtDateTime(d.applicationDeadline)} ({countdown(d.applicationDeadline, now)})</span></CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {d.myApplication ? (
            <div className="flex items-center gap-2"><Badge variant={statusVariant(d.myApplication.status)}>Applied: {titleCase(d.myApplication.status)}</Badge>
              {open && d.myApplication.status !== "WITHDRAWN" && <Button variant="outline" size="sm" disabled={busy} onClick={() => act("withdraw")}>Withdraw</Button>}</div>
          ) : d.eligibility.eligible ? (
            <div className="flex flex-col gap-2">
              {(resumes.data?.documents.length ?? 0) > 0 && <div className="flex flex-col gap-1 text-sm"><span className="text-muted-foreground">Resume to send</span><OptionSelect className="w-72" value={resumeId} onChange={setResumeId} options={[{ value: "", label: "Generated from my verified profile" }, ...resumes.data!.documents.map((x) => ({ value: x.id, label: x.fileName }))]} placeholder="Resume" /><span className="text-xs text-muted-foreground">The version you send is saved as it is today. Later changes will not alter it.</span></div>}
              <div><Button disabled={busy || !open} onClick={() => act("apply")}>{busy && <Spinner />}Apply now</Button>{!open && <span className="ml-2 text-sm text-muted-foreground">Applications are closed.</span>}</div></div>
          ) : (
            <Alert variant="destructive"><AlertTitle>{d.eligibility.blocked ? "You are blocked from drives" : "You are not eligible for this drive"}</AlertTitle><AlertDescription><ul className="list-disc pl-5">{d.eligibility.reasons.map((r) => <li key={r}>{r}</li>)}</ul></AlertDescription></Alert>
          )}
          {d.description && <p className="whitespace-pre-wrap text-sm">{d.description}</p>}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardHeader><CardTitle>Rounds</CardTitle></CardHeader><CardContent className="flex flex-col gap-2 text-sm">
          {d.rounds.map((r) => <div key={r.id} className="flex justify-between gap-2"><span>{r.order}. {titleCase(r.type)}</span><span className="text-muted-foreground">{fmtDateTime(r.scheduledAt)}{r.venue ? ` · ${r.venue}` : ""}</span></div>)}
          {d.rounds.length === 0 && <span className="text-muted-foreground">Rounds will be announced.</span>}
        </CardContent></Card>
        {d.requirements && (d.requirements.mandatory.length > 0 || d.requirements.preferred.length > 0) && (
          <Card><CardHeader><CardTitle>What the job needs</CardTitle></CardHeader><CardContent className="flex flex-col gap-3 text-sm">
            {d.requirements.mandatory.length > 0 && <div><div className="mb-1 font-medium">Required</div><ul className="list-disc pl-5">{d.requirements.mandatory.map((r, i) => <li key={i}>{r.text}</li>)}</ul></div>}
            {d.requirements.preferred.length > 0 && <div><div className="mb-1 font-medium">Preferred</div><ul className="list-disc pl-5 text-muted-foreground">{d.requirements.preferred.map((r, i) => <li key={i}>{r.text}</li>)}</ul></div>}
            {d.requirements.experience && <p><span className="font-medium">Experience: </span>{d.requirements.experience}</p>}
            {d.requirements.selectionProcess.length > 0 && <p><span className="font-medium">Selection process: </span>{d.requirements.selectionProcess.join(", ")}</p>}
            {d.requirements.other && <p className="whitespace-pre-wrap">{d.requirements.other}</p>}
          </CardContent></Card>
        )}
        <Card><CardHeader><CardTitle>Eligibility rules</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-1 text-sm">
          <span className="text-muted-foreground">Minimum CGPA</span><span>{d.rules.minCgpa ?? "None"}</span>
          <span className="text-muted-foreground">10th / 12th</span><span>{d.rules.minTenthPct ?? "—"} / {d.rules.minTwelfthPct ?? "—"}</span>
          <span className="text-muted-foreground">Max backlogs</span><span>{d.rules.maxActiveBacklogs ?? "None"}</span>
          <span className="text-muted-foreground">Placed students</span><span>{d.rules.allowPlaced ? "May apply" : "Cannot apply"}</span>
          <span className="text-muted-foreground">Drive date</span><span>{fmtDate(d.driveDate)}{d.venue ? ` · ${d.venue}` : ""}</span>
        </CardContent></Card>
      </div>

      {d.documents.length > 0 && <Card><CardHeader><CardTitle>Documents</CardTitle></CardHeader><CardContent className="flex flex-col gap-1 text-sm">{d.documents.map((x) => <a key={x.id} className="underline underline-offset-4" href={x.url ?? "#"} target="_blank" rel="noreferrer">{x.fileName}</a>)}</CardContent></Card>}

      {hasAttendance && d.myApplication && (
        <Card>
          <CardHeader><CardTitle>Check in on the day</CardTitle><CardDescription>Type the 6-character code shown by the placement team, or paste what your phone camera read from their QR code.</CardDescription></CardHeader>
          <CardContent className="flex items-end gap-2">
            <Field className="max-w-48"><FieldLabel htmlFor="code">Code</FieldLabel><Input id="code" value={code} maxLength={6} onChange={(e) => setCode(e.target.value.split(":").pop()!.toUpperCase().slice(0, 6))} className="tracking-widest" /></Field>
            <Button disabled={busy || code.length !== 6} onClick={checkIn}>Check in</Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
