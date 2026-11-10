"use client"

import * as React from "react"
import Link from "next/link"
import { SparklesIcon, Trash2Icon } from "lucide-react"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { MATCH_LABEL, MATCH_PARAMS, REQ_KINDS, REQ_LABEL, scoringProblem, type JdData, type Requirement } from "@/lib/jd"
import { api, toastError } from "@/lib/web/api"
import { useAuth, hasRole } from "@/lib/web/auth"
import { fmtDateTime, titleCase } from "@/lib/web/format"
import { useLookups } from "@/lib/web/lookups"
import { useApi } from "@/lib/web/use-api"

type Detail = {
  id: string; status: string; source: string; title: string; companyName: string; companyId: string | null; rawText: string | null; fileName: string | null; fileUrl: string | null; data: JdData
  extractionNotes: string[]; extractedAt: string | null; reviewNote: string | null; approvedAt: string | null; drive: { id: string; status: string; role: string } | null; problems: string[]
  shares: { id: string; share: number }[]
}
const TYPES = [{ value: "", label: "Not chosen" }, { value: "FULL_TIME", label: "Full time" }, { value: "INTERNSHIP", label: "Internship" }, { value: "INTERNSHIP_WITH_OFFER", label: "Internship with a job offer" }]
const n = (s: string) => (s.trim() === "" ? null : Number(s))

/** Reviewing a job description: the original text beside the structured form, requirements marked mandatory or preferred, rules, scoring weights, and approval. */
export function JdReview({ id }: { id: string }) {
  const { data: d, reload } = useApi<Detail>(`/api/jds/${id}`)
  const { state } = useAuth()
  const admin = state.status === "ready" && hasRole(state.profile, "TPO_ADMIN")
  const lk = useLookups()
  const progs = useApi<{ id: string; name: string }[]>("/api/settings/programs")
  const [form, setForm] = React.useState<JdData | null>(null)
  const [dirty, setDirty] = React.useState(false)
  const [find, setFind] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [dlg, setDlg] = React.useState<"back" | "again" | "drive" | null>(null)
  const [note, setNote] = React.useState("")
  // The form is filled from the server whenever fresh data arrives (first load, and after a save or a workflow change).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => { if (d) { setForm(d.data); setDirty(false) } }, [d])
  if (!d || !form) return <Skeleton className="h-96" />
  const locked = d.status === "APPROVED" || d.status === "ARCHIVED"
  const set = (p: Partial<JdData>) => { setForm((f) => (f ? { ...f, ...p } : f)); setDirty(true) }
  const setEl = (p: Partial<JdData["eligibility"]>) => set({ eligibility: { ...form.eligibility, ...p } })
  const setReq = (rid: string, p: Partial<Requirement>) => set({ requirements: form.requirements.map((r) => (r.id === rid ? { ...r, needsCheck: false, ...p } : r)) })
  const toggle = (k: "departmentIds" | "programIds" | "batchIds", v: string) => setEl({ [k]: form.eligibility[k].includes(v) ? form.eligibility[k].filter((x) => x !== v) : [...form.eligibility[k], v] })
  async function run(key: string, f: () => Promise<unknown>, ok?: string) { setBusy(key); try { await f(); if (ok) toast.success(ok); reload() } catch (e) { toastError(e) } finally { setBusy(null) } }
  const save = () => run("save", () => api(`/api/jds/${id}`, { method: "PATCH", body: { data: form } }), "Saved")
  const act = (action: string, ok: string, note?: string) => run("act", async () => { if (dirty) await api(`/api/jds/${id}`, { method: "PATCH", body: { data: form } }); await api(`/api/jds/${id}/review`, { method: "POST", body: { action, note } }) }, ok)
  const extract = (overwrite: boolean) => run("ai", async () => { const r = await api<{ requirements: number; flagged: number }>(`/api/jds/${id}/extract`, { method: "POST", body: { overwrite } }); toast.success(`Read ${r.requirements} requirements${r.flagged ? `, ${r.flagged} to check` : ""}`) })
  const scoreSum = MATCH_PARAMS.reduce((a, k) => a + form.scoring[k], 0)
  const highlighted = (() => {
    const t = d.rawText ?? ""; if (!find) return <>{t}</>
    const i = t.toLowerCase().indexOf(find.toLowerCase()); if (i < 0) return <><mark className="bg-destructive/20">Not found word for word in the document.</mark>{"\n\n"}{t}</>
    return <>{t.slice(0, i)}<mark ref={(el) => el?.scrollIntoView({ block: "center" })} className="bg-primary/25">{t.slice(i, i + find.length)}</mark>{t.slice(i + find.length)}</>
  })()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex items-center gap-2"><h1 className="text-xl font-semibold">{form.title || "Untitled job description"}</h1><Badge variant={d.status === "APPROVED" ? "default" : "outline"}>{titleCase(d.status)}</Badge></div><p className="text-sm text-muted-foreground">{form.company || "No company yet"} · {titleCase(d.source)}{d.extractedAt ? ` · read by AI ${fmtDateTime(d.extractedAt)}` : ""}</p></div>
        <div className="flex flex-wrap gap-2">
          {!locked && d.rawText && <Button variant="outline" disabled={!!busy} onClick={() => (form.requirements.length ? setDlg("again") : void extract(false))}>{busy === "ai" ? <Spinner /> : <SparklesIcon />}Read with AI</Button>}
          {!locked && <Button disabled={!!busy || !dirty} onClick={save}>{busy === "save" && <Spinner />}Save</Button>}
          {d.status === "DRAFT" && <Button variant={admin ? "outline" : "default"} disabled={!!busy} onClick={() => act("SUBMIT", "Sent for review")}>Send for review</Button>}
          {admin && (d.status === "DRAFT" || d.status === "IN_REVIEW") && <Button disabled={!!busy} onClick={() => act("APPROVE", "Approved")}>Approve</Button>}
          {admin && d.status === "IN_REVIEW" && <Button variant="outline" disabled={!!busy} onClick={() => { setNote(""); setDlg("back") }}>Send back</Button>}
          {admin && d.status === "APPROVED" && <Button variant="outline" disabled={!!busy} onClick={() => act("REOPEN", "Reopened as a draft")}>Reopen</Button>}
          {d.status === "APPROVED" && <Button variant="outline" render={<Link href={`/staff/job-descriptions/${id}/matches`} />}>Match candidates</Button>}
          {d.status === "APPROVED" && !d.drive && <Button disabled={!!busy} onClick={() => setDlg("drive")}>Create a drive</Button>}
          {d.status !== "ARCHIVED" && <Button variant="ghost" disabled={!!busy} onClick={() => act("ARCHIVE", "Archived")}>Archive</Button>}
        </div>
      </div>
      {d.drive && <Alert><AlertTitle>Drive: {d.drive.role} ({titleCase(d.drive.status)})</AlertTitle><AlertDescription><Link className="underline underline-offset-4" href={`/staff/drives/${d.drive.id}`}>Open the drive</Link>. It cannot be published unless this job description stays approved.</AlertDescription></Alert>}
      {d.reviewNote && d.status === "DRAFT" && <Alert variant="destructive"><AlertTitle>Sent back</AlertTitle><AlertDescription>{d.reviewNote}</AlertDescription></Alert>}
      {d.extractionNotes.length > 0 && !locked && <Alert><AlertTitle>The AI was not sure about some things</AlertTitle><AlertDescription><ul className="list-disc pl-5">{d.extractionNotes.map((x) => <li key={x}>{x}</li>)}</ul></AlertDescription></Alert>}
      {!locked && (d.status === "DRAFT" || d.status === "IN_REVIEW") && d.problems.length > 0 && <Alert><AlertTitle>Before it can be approved</AlertTitle><AlertDescription><ul className="list-disc pl-5">{d.problems.map((x) => <li key={x}>{x}</li>)}</ul></AlertDescription></Alert>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card size="sm" className="max-h-[75vh] overflow-hidden"><CardHeader><CardTitle>Original document</CardTitle><CardDescription>{d.fileName ? <>{d.fileUrl ? <a className="underline underline-offset-4" href={d.fileUrl} target="_blank" rel="noreferrer">{d.fileName}</a> : d.fileName}</> : d.source === "PASTE" ? "Pasted text" : "Written by hand"}</CardDescription></CardHeader>
          <CardContent className="overflow-y-auto"><pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed">{d.rawText ? highlighted : "There is no source text."}</pre></CardContent></Card>

        <Tabs defaultValue="reqs">
          <TabsList><TabsTrigger value="details">Details</TabsTrigger><TabsTrigger value="reqs">Requirements ({form.requirements.length})</TabsTrigger><TabsTrigger value="rules">Eligibility and process</TabsTrigger><TabsTrigger value="score">Matching weights</TabsTrigger></TabsList>

          <TabsContent value="details"><fieldset disabled={locked} className="contents"><FieldGroup>
            <Field><FieldLabel htmlFor="j-t">Job title</FieldLabel><Input id="j-t" value={form.title} onChange={(e) => set({ title: e.target.value })} /></Field>
            <Field><FieldLabel htmlFor="j-c">Company</FieldLabel><Input id="j-c" value={form.company} onChange={(e) => set({ company: e.target.value })} /></Field>
            <Field><FieldLabel htmlFor="j-d">Job description</FieldLabel><Textarea id="j-d" className="min-h-28" value={form.description} onChange={(e) => set({ description: e.target.value })} /></Field>
            <div className="grid gap-3 sm:grid-cols-2"><Field><FieldLabel>Employment type</FieldLabel><OptionSelect className="w-full" value={form.jobType ?? ""} onChange={(v) => set({ jobType: (v || null) as JdData["jobType"] })} options={TYPES} placeholder="Not chosen" /></Field><Field><FieldLabel htmlFor="j-l">Location</FieldLabel><Input id="j-l" value={form.location ?? ""} onChange={(e) => set({ location: e.target.value || null })} /></Field></div>
            <div className="grid gap-3 sm:grid-cols-3"><Field><FieldLabel htmlFor="j-s1">Salary from (LPA)</FieldLabel><Input id="j-s1" type="number" min={0} step="0.1" value={form.salaryMinLpa ?? ""} onChange={(e) => set({ salaryMinLpa: n(e.target.value) })} /></Field><Field><FieldLabel htmlFor="j-s2">to (LPA)</FieldLabel><Input id="j-s2" type="number" min={0} step="0.1" value={form.salaryMaxLpa ?? ""} onChange={(e) => set({ salaryMaxLpa: n(e.target.value) })} /></Field><Field><FieldLabel htmlFor="j-e">Experience</FieldLabel><Input id="j-e" value={form.experienceText ?? ""} onChange={(e) => set({ experienceText: e.target.value || null })} /></Field></div>
            <Field><FieldLabel htmlFor="j-o">Other requirements</FieldLabel><Textarea id="j-o" value={form.other ?? ""} onChange={(e) => set({ other: e.target.value || null })} /></Field>
          </FieldGroup></fieldset></TabsContent>

          <TabsContent value="reqs" className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">Mark each as required or preferred and give it a weight (1 to 10). A requirement flagged &quot;check&quot; could not be found word for word in the document: look at it, then correct or confirm it.</p>
            {form.requirements.map((r) => {
              const share = d.shares.find((x) => x.id === r.id)?.share
              return (
                <div key={r.id} className={`flex flex-col gap-2 rounded-md border p-2 ${r.needsCheck ? "border-destructive/50" : ""}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <OptionSelect className="w-36" value={r.kind} onChange={(v) => setReq(r.id, { kind: v as Requirement["kind"] })} options={REQ_KINDS.map((k) => ({ value: k, label: REQ_LABEL[k] }))} placeholder="Kind" />
                    <Input aria-label="Requirement" className="min-w-48 flex-1" value={r.text} disabled={locked} onChange={(e) => setReq(r.id, { text: e.target.value })} />
                    <OptionSelect className="w-32" value={r.level} onChange={(v) => setReq(r.id, { level: v as Requirement["level"] })} options={[{ value: "MANDATORY", label: "Required" }, { value: "PREFERRED", label: "Preferred" }]} placeholder="Level" />
                    <Input aria-label="Weight" className="w-16" type="number" min={1} max={10} value={r.weight} disabled={locked} onChange={(e) => setReq(r.id, { weight: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })} />
                    {!locked && <Button type="button" size="icon-sm" variant="ghost" aria-label="Remove requirement" onClick={() => set({ requirements: form.requirements.filter((x) => x.id !== r.id) })}><Trash2Icon /></Button>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {r.needsCheck ? <Badge variant="destructive">Check</Badge> : r.quote ? <Badge variant="secondary">In the document</Badge> : <Badge variant="outline">Added by hand</Badge>}
                    {share !== undefined && <span>{share}% of {REQ_LABEL[r.kind].toLowerCase()} score</span>}
                    {r.quote && <button type="button" className="underline underline-offset-4" onClick={() => setFind(r.quote!)}>Show in the document</button>}
                    {r.needsCheck && !locked && <button type="button" className="underline underline-offset-4" onClick={() => setReq(r.id, {})}>I have checked it</button>}
                  </div>
                </div>
              )
            })}
            {!locked && <div><Button type="button" size="sm" variant="outline" onClick={() => set({ requirements: [...form.requirements, { id: `r${Date.now().toString(36)}`, kind: "SKILL", text: "", level: "MANDATORY", weight: 5, needsCheck: false }] })}>Add a requirement</Button></div>}
          </TabsContent>

          <TabsContent value="rules"><fieldset disabled={locked} className="contents"><FieldGroup>
            <div className="grid gap-3 sm:grid-cols-4"><Field><FieldLabel htmlFor="e-g">Minimum CGPA</FieldLabel><Input id="e-g" type="number" step="0.01" min={0} max={10} value={form.eligibility.minCgpa ?? ""} onChange={(e) => setEl({ minCgpa: n(e.target.value) })} /></Field><Field><FieldLabel htmlFor="e-10">Minimum 10th %</FieldLabel><Input id="e-10" type="number" min={0} max={100} value={form.eligibility.minTenthPct ?? ""} onChange={(e) => setEl({ minTenthPct: n(e.target.value) })} /></Field><Field><FieldLabel htmlFor="e-12">Minimum 12th %</FieldLabel><Input id="e-12" type="number" min={0} max={100} value={form.eligibility.minTwelfthPct ?? ""} onChange={(e) => setEl({ minTwelfthPct: n(e.target.value) })} /></Field><Field><FieldLabel htmlFor="e-b">Most active backlogs</FieldLabel><Input id="e-b" type="number" min={0} value={form.eligibility.maxActiveBacklogs ?? ""} onChange={(e) => setEl({ maxActiveBacklogs: n(e.target.value) })} /></Field></div>
            {form.eligibility.branchesAsStated.length > 0 && <Alert><AlertTitle>The document names these branches</AlertTitle><AlertDescription>{form.eligibility.branchesAsStated.join(", ")}. Tick the matching departments or programmes below, then clear this list.<div className="mt-2"><Button type="button" size="sm" variant="outline" onClick={() => setEl({ branchesAsStated: [] })}>I have matched them</Button></div></AlertDescription></Alert>}
            <div className="flex flex-col gap-1 text-sm"><span className="font-medium">Departments (none ticked = all)</span><div className="flex flex-wrap gap-3">{lk.departments.map((x) => <label key={x.value} className="flex items-center gap-1"><Checkbox checked={form.eligibility.departmentIds.includes(x.value)} onCheckedChange={() => toggle("departmentIds", x.value)} />{x.label}</label>)}</div></div>
            <div className="flex flex-col gap-1 text-sm"><span className="font-medium">Programmes (none ticked = all)</span><div className="flex flex-wrap gap-3">{(progs.data ?? []).map((x) => <label key={x.id} className="flex items-center gap-1"><Checkbox checked={form.eligibility.programIds.includes(x.id)} onCheckedChange={() => toggle("programIds", x.id)} />{x.name}</label>)}</div></div>
            <div className="flex flex-col gap-1 text-sm"><span className="font-medium">Batches (none ticked = all)</span><div className="flex flex-wrap gap-3">{lk.batches.map((x) => <label key={x.value} className="flex items-center gap-1"><Checkbox checked={form.eligibility.batchIds.includes(x.value)} onCheckedChange={() => toggle("batchIds", x.value)} />{x.label}</label>)}</div></div>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.eligibility.allowPlaced} onCheckedChange={(v) => setEl({ allowPlaced: v })} />Placed students may apply</label>
            <Field><FieldLabel htmlFor="sp">Selection process, one round per line</FieldLabel><Textarea id="sp" className="min-h-24" value={form.selectionProcess.join("\n")} onChange={(e) => set({ selectionProcess: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 12) })} /></Field>
          </FieldGroup></fieldset></TabsContent>

          <TabsContent value="score"><fieldset disabled={locked} className="contents"><FieldGroup>
            <p className="text-sm text-muted-foreground">How much each area counts when students are matched to this job (the college&apos;s own choice; the defaults are the SRS&apos;s suggestions). They must add up to 100.</p>
            {MATCH_PARAMS.map((k) => <div key={k} className="flex items-center gap-3 text-sm"><label htmlFor={`w-${k}`} className="w-36">{MATCH_LABEL[k]}</label><Input id={`w-${k}`} className="w-24" type="number" min={0} max={100} value={form.scoring[k]} onChange={(e) => set({ scoring: { ...form.scoring, [k]: Math.min(100, Math.max(0, Math.round(Number(e.target.value) || 0))) } })} /></div>)}
            <p className={`text-sm ${scoringProblem(form.scoring) ? "text-destructive" : "text-muted-foreground"}`}>Total {scoreSum}{scoringProblem(form.scoring) ? " (must be 100)" : ""}. Inside the technical score, a required skill counts double a preferred one of the same weight.</p>
          </FieldGroup></fieldset></TabsContent>
        </Tabs>
      </div>

      {dlg === "back" && (
        <Dialog open onOpenChange={(o) => !o && setDlg(null)}><DialogContent>
          <DialogHeader><DialogTitle>Send back for changes</DialogTitle></DialogHeader><Textarea aria-label="What needs to change" placeholder="What needs to change?" value={note} onChange={(e) => setNote(e.target.value)} />
          <DialogFooter><Button disabled={note.trim().length < 3} onClick={() => { setDlg(null); void act("REJECT", "Sent back", note) }}>Send back</Button></DialogFooter>
        </DialogContent></Dialog>
      )}
      {dlg === "again" && (
        <Dialog open onOpenChange={(o) => !o && setDlg(null)}><DialogContent>
          <DialogHeader><DialogTitle>Read it again with the AI?</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">This replaces the requirements, rules and details in the form with a fresh reading, including any changes you made.</p>
          <DialogFooter><Button variant="outline" onClick={() => setDlg(null)}>Keep my edits</Button><Button onClick={() => { setDlg(null); void extract(true) }}>Replace them</Button></DialogFooter>
        </DialogContent></Dialog>
      )}
      {dlg === "drive" && <DriveDialog id={id} onClose={() => setDlg(null)} onDone={() => { setDlg(null); reload() }} />}
    </div>
  )
}

function DriveDialog({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const companies = useApi<{ items: { id: string; name: string }[] }>("/api/companies", { limit: 100 })
  const [f, setF] = React.useState({ companyId: "", applicationDeadline: "", driveDate: "", venue: "" })
  const [busy, setBusy] = React.useState(false)
  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    try { await api(`/api/jds/${id}/drive`, { method: "POST", body: { companyId: f.companyId, applicationDeadline: new Date(f.applicationDeadline).toISOString(), driveDate: new Date(f.driveDate).toISOString(), venue: f.venue || undefined } }); toast.success("Draft drive created from this job description"); onDone() } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent><DialogHeader><DialogTitle>Create a drive from this job description</DialogTitle></DialogHeader>
      <form onSubmit={go} className="flex flex-col gap-4"><FieldGroup>
        <Field><FieldLabel>Company</FieldLabel><OptionSelect className="w-full" value={f.companyId} onChange={(v) => setF({ ...f, companyId: v })} options={(companies.data?.items ?? []).map((c) => ({ value: c.id, label: c.name }))} placeholder="Choose the company" /></Field>
        <Field><FieldLabel htmlFor="d-a">Applications close</FieldLabel><Input id="d-a" type="datetime-local" required value={f.applicationDeadline} onChange={(e) => setF({ ...f, applicationDeadline: e.target.value })} /></Field>
        <Field><FieldLabel htmlFor="d-d">Drive date</FieldLabel><Input id="d-d" type="datetime-local" required value={f.driveDate} onChange={(e) => setF({ ...f, driveDate: e.target.value })} /></Field>
        <Field><FieldLabel htmlFor="d-v">Venue (optional)</FieldLabel><Input id="d-v" value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} /></Field>
      </FieldGroup><DialogFooter><Button type="submit" disabled={busy || !f.companyId}>{busy && <Spinner />}Create draft drive</Button></DialogFooter></form></DialogContent></Dialog>
  )
}
