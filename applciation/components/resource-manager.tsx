"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { StudentPicker } from "@/components/master-tab"
import { OptionSelect } from "@/components/option-select"
import { BLANK, ResourceForm, toBody, type ResourceValues } from "@/components/resource-form"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { useAuth, hasRole } from "@/lib/web/auth"
import { fmtDate, fmtDateTime, titleCase } from "@/lib/web/format"
import { useLookups } from "@/lib/web/lookups"
import { useApi } from "@/lib/web/use-api"

type Eff = { assigned: number; opened: number; completed: number; openedPercent: number | null; completionPercent: number | null; ratings: number; averageRating: number | null; helpfulPercent: number | null; scoreLink: { completedAverage: number; othersAverage: number; difference: number; completedStudents: number; otherStudents: number } | null }
type R = {
  id: string; title: string; description: string | null; category: string; type: string; url: string | null; hasFile: boolean; fileName: string | null; fileUrl: string | null; sizeBytes: number | null; mimeType: string | null
  subject: string | null; topic: string | null; skills: string[]; jobRoles: string[]; companyName: string | null; difficulty: string | null; language: string; durationMin: number | null; status: string; version: number
  expiresAt: string | null; expiry: string; visibility: string; reviewNote: string | null; reviewedAt: string | null
  versions: { id: string; version: number; url: string | null; fileName: string | null; hasFile: boolean; createdAt: string }[]
  assignments: { id: string; targetType: string; label: string; note: string | null; dueAt: string | null; createdAt: string }[]
  effectiveness: Eff
}
const SKILLS = ["aptitude", "technical", "digital", "communication", "teamwork"].map((v) => ({ value: v, label: `Weak in ${v}` }))
const TARGETS = [{ value: "STUDENT", label: "A student" }, { value: "DEPARTMENT", label: "A department" }, { value: "BATCH", label: "A batch" }, { value: "GROUP", label: "A preparation group (learning programme)" }, { value: "SKILL_GAP", label: "Everyone with a skill gap" }, { value: "MOCK_TEST", label: "Students taking a mock test" }]
const toValues = (r: R): ResourceValues => ({ ...BLANK, title: r.title, description: r.description ?? "", category: r.category, type: r.type, url: r.url ?? "", subject: r.subject ?? "", topic: r.topic ?? "", skills: r.skills.join(", "), jobRoles: r.jobRoles.join(", "), companyName: r.companyName ?? "", difficulty: r.difficulty ?? "", language: r.language, durationMin: r.durationMin ? String(r.durationMin) : "", expiresAt: r.expiresAt ? r.expiresAt.slice(0, 10) : "", visibility: r.visibility })

/** One resource: details, the review workflow, files and versions, who it is assigned to, and how it is doing. */
export function ResourceManager({ id }: { id: string }) {
  const { data: r, reload } = useApi<R>(`/api/resources/${id}`)
  const { state } = useAuth()
  const router = useRouter()
  const [v, setV] = React.useState<ResourceValues | null>(null)
  const [file, setFile] = React.useState<File | null>(null)
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState<string | null>(null)
  const refill = React.useRef(false)
  // The form is filled from the server when it first loads and again after a save or a workflow change; other reloads keep what is being typed.
  React.useEffect(() => { if (r && (!v || refill.current)) { setV(toValues(r)); refill.current = false } }, [r]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!r || !v) return <Skeleton className="h-64" />
  const admin = state.status === "ready" && hasRole(state.profile, "TPO_ADMIN")

  async function run(key: string, f: () => Promise<unknown>, ok?: string, refillForm = false) {
    setBusy(key)
    try { await f(); if (ok) toast.success(ok); if (refillForm) refill.current = true; reload() } catch (e) { toastError(e) } finally { setBusy(null) }
  }
  const review = (action: string, ok: string, n?: string) => run("review", () => api(`/api/resources/${id}/review`, { method: "POST", body: { action, note: n } }), ok, true)
  const save = () => run("save", async () => {
    await api(`/api/resources/${id}`, { method: "PATCH", body: toBody(v) })
    if (file) { const fd = new FormData(); fd.set("file", file); await api(`/api/resources/${id}/file`, { method: "POST", body: fd }); setFile(null) }
  }, "Saved", true)
  const e = r.effectiveness

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex items-center gap-2"><h1 className="text-xl font-semibold">{r.title}</h1><Badge>{titleCase(r.status)}</Badge><Badge variant="outline">v{r.version}</Badge></div>
          <p className="text-sm text-muted-foreground">{titleCase(r.type)}{r.hasFile ? ` · ${r.fileName}` : r.url ? " · link" : " · nothing attached yet"}{r.expiry === "EXPIRED" ? " · expired" : r.expiry === "SOON" ? ` · expires ${fmtDate(r.expiresAt)}` : ""}</p></div>
        <div className="flex flex-wrap gap-2">
          {(r.status === "DRAFT" || r.status === "REJECTED") && <Button variant={admin ? "outline" : "default"} disabled={busy === "review"} onClick={() => review("SUBMIT", "Sent for review")}>Send for review</Button>}
          {admin && (r.status === "IN_REVIEW" || r.status === "DRAFT") && <Button disabled={busy === "review"} onClick={() => review("APPROVE", "Approved")}>Approve</Button>}
          {r.status !== "ARCHIVED" && <Button variant="outline" disabled={busy === "review"} onClick={() => review("ARCHIVE", "Archived")}>Archive</Button>}
          {r.status === "ARCHIVED" && <Button variant="outline" disabled={busy === "review"} onClick={() => review("RESTORE", "Restored as a draft")}>Restore</Button>}
        </div>
      </div>
      {r.status === "REJECTED" && <Alert variant="destructive"><AlertTitle>Rejected</AlertTitle><AlertDescription>{r.reviewNote}</AlertDescription></Alert>}
      {r.status === "IN_REVIEW" && !admin && <Alert><AlertTitle>Waiting for the placement admin</AlertTitle><AlertDescription>Only the admin can approve it. Students cannot see it until then.</AlertDescription></Alert>}
      {admin && r.status === "IN_REVIEW" && (
        <Card size="sm"><CardHeader><CardTitle>Review</CardTitle><CardDescription>Approve it, or reject it with a reason the uploader will see.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2"><Textarea aria-label="Reason for rejecting" placeholder="Reason (needed to reject)" value={note} onChange={(x) => setNote(x.target.value)} /><div><Button variant="destructive" size="sm" disabled={busy === "review" || note.trim().length < 3} onClick={() => review("REJECT", "Rejected", note)}>Reject</Button></div></CardContent></Card>
      )}

      <Tabs defaultValue="details">
        <TabsList><TabsTrigger value="details">Details and file</TabsTrigger><TabsTrigger value="assign">Assign ({r.assignments.length})</TabsTrigger><TabsTrigger value="results">How it is doing</TabsTrigger></TabsList>

        <TabsContent value="details" className="flex max-w-2xl flex-col gap-4">
          <ResourceForm v={v} set={(p) => setV((o) => ({ ...(o ?? BLANK), ...p }))} showFile onFile={setFile} />
          {r.hasFile && <p className="text-sm text-muted-foreground">Current file: {r.fileUrl ? <a className="underline underline-offset-4" href={r.fileUrl} target="_blank" rel="noreferrer">{r.fileName}</a> : r.fileName}. Uploading another makes version {r.version + 1}{r.status === "APPROVED" ? ", which must be approved again; students lose access until then" : ""}.</p>}
          <div className="flex gap-2">
            <Button disabled={busy === "save"} onClick={save}>{busy === "save" && <Spinner />}Save changes</Button>
            {(r.status === "DRAFT" || r.status === "REJECTED") && <Button variant="destructive" onClick={() => run("del", async () => { await api(`/api/resources/${id}`, { method: "DELETE" }); router.push("/staff/resources") })}>Delete</Button>}
          </div>
          {r.versions.length > 0 && <div className="flex flex-col gap-1 text-sm"><h2 className="font-medium">Earlier versions</h2>{r.versions.map((x) => <div key={x.id} className="text-muted-foreground">v{x.version}: {x.fileName ?? x.url ?? "—"} (replaced {fmtDate(x.createdAt)})</div>)}</div>}
        </TabsContent>

        <TabsContent value="assign"><Assign id={id} approved={r.status === "APPROVED"} visibility={r.visibility} assignments={r.assignments} onChange={reload} /></TabsContent>

        <TabsContent value="results" className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[["Reached", e.assigned || "—"], ["Opened", e.openedPercent === null ? e.opened : `${e.opened} (${e.openedPercent}%)`], ["Finished", e.completionPercent === null ? e.completed : `${e.completed} (${e.completionPercent}%)`], ["Rating", e.averageRating === null ? "—" : `${e.averageRating}/5 (${e.ratings})`]].map(([l, x]) => <Card key={l as string} size="sm"><CardHeader><CardDescription>{l}</CardDescription><CardTitle className="text-2xl">{x}</CardTitle></CardHeader></Card>)}
          </div>
          {e.helpfulPercent !== null && <p className="text-sm">{e.helpfulPercent}% of ratings were 4 or 5.</p>}
          {e.scoreLink ? <Alert><AlertTitle>Assessment link</AlertTitle><AlertDescription>Students who finished it averaged {e.scoreLink.completedAverage}% in the matching assessment ({e.scoreLink.completedStudents} students), others {e.scoreLink.othersAverage}% ({e.scoreLink.otherStudents}), a difference of {e.scoreLink.difference} points. This shows a link, not proof it caused the difference: students who finish things tend to score higher anyway.</AlertDescription></Alert> : <p className="text-sm text-muted-foreground">Not enough students yet (at least 5 who finished and 5 who did not, with assessment scores) to compare assessment results.</p>}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Assign({ id, approved, visibility, assignments, onChange }: { id: string; approved: boolean; visibility: string; assignments: R["assignments"]; onChange: () => void }) {
  const lk = useLookups()
  const progs = useApi<{ id: string; title: string }[]>("/api/learning/programmes")
  const papers = useApi<{ id: string; title: string }[]>("/api/assessments/papers")
  const [t, setT] = React.useState("STUDENT")
  const [target, setTarget] = React.useState("")
  const [due, setDue] = React.useState("")
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const opts = t === "DEPARTMENT" ? lk.departments : t === "BATCH" ? lk.batches : t === "GROUP" ? (progs.data ?? []).map((p) => ({ value: p.id, label: p.title })) : t === "MOCK_TEST" ? (papers.data ?? []).map((p) => ({ value: p.id, label: p.title })) : t === "SKILL_GAP" ? SKILLS : []
  async function add(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    try {
      const body = { targetType: t, ...(t === "SKILL_GAP" ? { targetKey: target } : { targetId: target }), ...(note ? { note } : {}), ...(due ? { dueAt: new Date(due).toISOString() } : {}) }
      const r = await api<{ added: number; notified: number }>(`/api/resources/${id}/assignments`, { method: "POST", body })
      toast.success(r.added ? `Assigned. ${r.notified} student${r.notified === 1 ? "" : "s"} told` : "Already assigned"); setTarget(""); onChange()
    } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {!approved && <Alert><AlertTitle>Approve it first</AlertTitle><AlertDescription>Only an approved resource can be assigned.</AlertDescription></Alert>}
      {visibility === "STAFF_ONLY" && <Alert><AlertTitle>Staff only</AlertTitle><AlertDescription>Change its visibility on the Details tab before assigning it to students.</AlertDescription></Alert>}
      <form onSubmit={add} className="flex flex-col gap-3">
        <FieldGroup>
          <Field><FieldLabel>Assign to</FieldLabel><OptionSelect className="w-full" value={t} onChange={(x) => { setT(x); setTarget("") }} options={TARGETS} placeholder="Who" /></Field>
          <Field><FieldLabel>{t === "STUDENT" ? "Student" : "Choose"}</FieldLabel>{t === "STUDENT" ? <StudentPicker value={target} onChange={setTarget} /> : <OptionSelect className="w-full" value={target} onChange={setTarget} options={opts} placeholder="Choose" />}</Field>
          <Field><FieldLabel htmlFor="a-due">Finish by (optional)</FieldLabel><Input id="a-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
          <Field><FieldLabel htmlFor="a-note">Note to students (optional)</FieldLabel><Input id="a-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></Field>
        </FieldGroup>
        <div><Button type="submit" disabled={busy || !approved || !target || visibility === "STAFF_ONLY"}>{busy && <Spinner />}Assign</Button></div>
      </form>
      <div className="flex flex-col gap-2 text-sm">
        <h2 className="font-medium">Assigned to</h2>
        {assignments.length === 0 && <p className="text-muted-foreground">Nobody yet.</p>}
        {assignments.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
            <div><span className="font-medium">{a.label}</span> <Badge variant="outline">{titleCase(a.targetType)}</Badge>{a.dueAt && <span className="text-muted-foreground"> · by {fmtDate(a.dueAt)}</span>}{a.note && <div className="text-xs text-muted-foreground">{a.note}</div>}<div className="text-xs text-muted-foreground">added {fmtDateTime(a.createdAt)}</div></div>
            <Button size="icon-sm" variant="ghost" aria-label="Remove assignment" onClick={() => api(`/api/resources/${id}/assignments/${a.id}`, { method: "DELETE" }).then(() => { toast.success("Removed"); onChange() }, toastError)}><Trash2Icon /></Button>
          </div>
        ))}
      </div>
    </div>
  )
}
