"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"

import { StudentPicker } from "@/components/master-tab"
import { OptionSelect } from "@/components/option-select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, titleCase } from "@/lib/web/format"
import { useLookups } from "@/lib/web/lookups"
import { useApi } from "@/lib/web/use-api"

export type Project = {
  id: string; title: string; problemStatement: string; skills: string[]; type: string; status: string; minTeamSize: number; maxTeamSize: number; departmentIds: string[]; batchIds: string[]; guideId: string | null; guideName: string | null
  industryPartner: string | null; startsAt: string | null; dueAt: string | null; selfFormTeams: boolean; maxTeams: number | null; milestoneTemplate: { title: string; dueInDays: number }[]; proposedById: string | null; rejectReason: string | null
  teams: { id: string; name: string; status: string; members: string[]; memberCount: number; progress: { percent: number; overdue: number }; repoUrl: string | null; finalPercent: number | null }[]
}
export const STATUS: Record<string, "default" | "secondary" | "destructive" | "outline"> = { OPEN: "default", PROPOSED: "secondary", DRAFT: "outline", CLOSED: "outline", ARCHIVED: "outline", REJECTED: "destructive", ACTIVE: "default", FORMING: "outline", SUBMITTED: "secondary", EVALUATED: "default" }
const TYPES = [{ value: "INDIVIDUAL", label: "Individual" }, { value: "TEAM", label: "Team" }, { value: "INTERDISCIPLINARY", label: "Interdisciplinary (several departments)" }]
const date = (d: string | null) => (d ? d.slice(0, 10) : "")

type Values = { title: string; problemStatement: string; skills: string; type: string; minTeamSize: string; maxTeamSize: string; departmentIds: string[]; batchIds: string[]; guideId: string; industryPartner: string; startsAt: string; dueAt: string; selfFormTeams: boolean; maxTeams: string; milestones: string }
export const BLANK: Values = { title: "", problemStatement: "", skills: "", type: "TEAM", minTeamSize: "2", maxTeamSize: "4", departmentIds: [], batchIds: [], guideId: "", industryPartner: "", startsAt: "", dueAt: "", selfFormTeams: true, maxTeams: "", milestones: "" }
export const fromProject = (p: Project): Values => ({ title: p.title, problemStatement: p.problemStatement, skills: p.skills.join(", "), type: p.type, minTeamSize: String(p.minTeamSize), maxTeamSize: String(p.maxTeamSize), departmentIds: p.departmentIds, batchIds: p.batchIds, guideId: p.guideId ?? "", industryPartner: p.industryPartner ?? "", startsAt: date(p.startsAt), dueAt: date(p.dueAt), selfFormTeams: p.selfFormTeams, maxTeams: p.maxTeams ? String(p.maxTeams) : "", milestones: p.milestoneTemplate.map((m) => `${m.title} | ${m.dueInDays}`).join("\n") })
export function toBody(v: Values) {
  const milestoneTemplate = v.milestones.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [t, d] = l.split("|").map((x) => x.trim()); return { title: t, dueInDays: Number(d) } })
  return {
    title: v.title, problemStatement: v.problemStatement, skills: v.skills.split(",").map((s) => s.trim()).filter(Boolean), type: v.type, ...(v.type === "INDIVIDUAL" ? {} : { minTeamSize: Number(v.minTeamSize), maxTeamSize: Number(v.maxTeamSize) }),
    departmentIds: v.departmentIds, batchIds: v.batchIds, guideId: v.guideId || null, industryPartner: v.industryPartner || null, startsAt: v.startsAt ? new Date(v.startsAt).toISOString() : null, dueAt: v.dueAt ? new Date(v.dueAt).toISOString() : null,
    selfFormTeams: v.selfFormTeams, maxTeams: v.maxTeams ? Number(v.maxTeams) : null, milestoneTemplate,
  }
}

/** The form for a project's settings: used to create and to edit. */
export function ProjectForm({ v, set, canPickGuide }: { v: Values; set: (p: Partial<Values>) => void; canPickGuide: boolean }) {
  const lk = useLookups()
  const guides = useApi<{ id: string; name: string }[]>(canPickGuide ? "/api/projects/guides" : null)
  const toggle = (k: "departmentIds" | "batchIds", id: string) => set({ [k]: v[k].includes(id) ? v[k].filter((x) => x !== id) : [...v[k], id] })
  return (
    <FieldGroup>
      <Field><FieldLabel htmlFor="p-title">Title</FieldLabel><Input id="p-title" required minLength={3} value={v.title} onChange={(e) => set({ title: e.target.value })} /></Field>
      <Field><FieldLabel htmlFor="p-prob">Problem statement</FieldLabel><Textarea id="p-prob" required minLength={20} className="min-h-28" value={v.problemStatement} onChange={(e) => set({ problemStatement: e.target.value })} /></Field>
      <Field><FieldLabel htmlFor="p-skills">Skills it uses, separated by commas</FieldLabel><Input id="p-skills" value={v.skills} onChange={(e) => set({ skills: e.target.value })} /></Field>
      <Field><FieldLabel>Kind of project</FieldLabel><OptionSelect className="w-full" value={v.type} onChange={(x) => set({ type: x })} options={TYPES} placeholder="Type" /></Field>
      {v.type !== "INDIVIDUAL" && <div className="grid grid-cols-2 gap-3"><Field><FieldLabel htmlFor="p-min">Smallest team</FieldLabel><Input id="p-min" type="number" min={2} max={20} value={v.minTeamSize} onChange={(e) => set({ minTeamSize: e.target.value })} /></Field><Field><FieldLabel htmlFor="p-max">Largest team</FieldLabel><Input id="p-max" type="number" min={2} max={20} value={v.maxTeamSize} onChange={(e) => set({ maxTeamSize: e.target.value })} /></Field></div>}
      <div className="flex flex-col gap-1 text-sm"><span className="font-medium">Open to departments (none ticked = all)</span><div className="flex flex-wrap gap-3">{lk.departments.map((d) => <label key={d.value} className="flex items-center gap-1"><Checkbox checked={v.departmentIds.includes(d.value)} onCheckedChange={() => toggle("departmentIds", d.value)} />{d.label}</label>)}</div></div>
      <div className="flex flex-col gap-1 text-sm"><span className="font-medium">Open to batches (none ticked = all)</span><div className="flex flex-wrap gap-3">{lk.batches.map((d) => <label key={d.value} className="flex items-center gap-1"><Checkbox checked={v.batchIds.includes(d.value)} onCheckedChange={() => toggle("batchIds", d.value)} />{d.label}</label>)}</div></div>
      {canPickGuide && <Field><FieldLabel>Faculty guide</FieldLabel><OptionSelect className="w-full" value={v.guideId} onChange={(x) => set({ guideId: x })} options={[{ value: "", label: "No guide yet" }, ...(guides.data ?? []).map((g) => ({ value: g.id, label: g.name }))]} placeholder="No guide yet" /></Field>}
      <Field><FieldLabel htmlFor="p-ind">Industry partner (optional)</FieldLabel><Input id="p-ind" value={v.industryPartner} onChange={(e) => set({ industryPartner: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3"><Field><FieldLabel htmlFor="p-start">Starts</FieldLabel><Input id="p-start" type="date" value={v.startsAt} onChange={(e) => set({ startsAt: e.target.value })} /></Field><Field><FieldLabel htmlFor="p-due">Due</FieldLabel><Input id="p-due" type="date" value={v.dueAt} onChange={(e) => set({ dueAt: e.target.value })} /></Field></div>
      <Field><FieldLabel htmlFor="p-max-teams">Most teams allowed (empty = no limit)</FieldLabel><Input id="p-max-teams" type="number" min={1} value={v.maxTeams} onChange={(e) => set({ maxTeams: e.target.value })} /></Field>
      <label className="flex items-center gap-2 text-sm"><Switch checked={v.selfFormTeams} onCheckedChange={(x) => set({ selfFormTeams: x })} />Students can start or join teams themselves (otherwise staff allocate them)</label>
      <Field><FieldLabel htmlFor="p-ms">Milestones every team gets, one per line: Title | days after the team starts</FieldLabel><Textarea id="p-ms" placeholder={"Design document | 14\nWorking prototype | 45"} value={v.milestones} onChange={(e) => set({ milestones: e.target.value })} /></Field>
    </FieldGroup>
  )
}

/** One project for staff: its settings, state changes, proposal approval and its teams (with allocation). */
export function ProjectManager({ id, isStaff }: { id: string; isStaff: boolean }) {
  const { data: p, reload } = useApi<Project>(`/api/projects/${id}`)
  const [edit, setEdit] = React.useState<Values | null>(null)
  const [alloc, setAlloc] = React.useState(false)
  const [reject, setReject] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  if (!p) return <Skeleton className="h-64" />
  async function run(key: string, f: () => Promise<unknown>, ok?: string) { setBusy(key); try { await f(); if (ok) toast.success(ok); reload() } catch (e) { toastError(e) } finally { setBusy(null) } }
  const act = (action: string, ok: string, reason?: string) => run("s", () => api(`/api/projects/${id}/status`, { method: "POST", body: { action, reason } }), ok)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex items-center gap-2"><h1 className="text-xl font-semibold">{p.title}</h1><Badge variant={STATUS[p.status]}>{titleCase(p.status)}</Badge><Badge variant="outline">{titleCase(p.type)}</Badge></div>
          <p className="text-sm text-muted-foreground">{p.guideName ? `Guide: ${p.guideName}` : "No guide yet"}{p.dueAt ? ` · due ${fmtDate(p.dueAt)}` : ""}{p.industryPartner ? ` · with ${p.industryPartner}` : ""}</p></div>
        <div className="flex flex-wrap gap-2">
          {p.status === "PROPOSED" && <><Button disabled={busy === "s"} onClick={() => act("APPROVE", "Approved. The student's team has started")}>Approve</Button><Button variant="destructive" onClick={() => setReject("")}>Reject</Button></>}
          {p.status === "DRAFT" && <Button disabled={busy === "s"} onClick={() => act("OPEN", "Open to students")}>Open to students</Button>}
          {p.status === "OPEN" && <Button variant="outline" disabled={busy === "s"} onClick={() => act("CLOSE", "Closed to new teams")}>Close</Button>}
          {p.status === "CLOSED" && <Button variant="outline" disabled={busy === "s"} onClick={() => act("OPEN", "Open again")}>Open again</Button>}
          {p.status === "OPEN" && p.teams.length === 0 && <Button variant="outline" onClick={() => act("DRAFT", "Back to draft")}>Back to draft</Button>}
          {!["ARCHIVED", "PROPOSED", "REJECTED"].includes(p.status) && <Button variant="outline" disabled={busy === "s"} onClick={() => act("ARCHIVE", "Archived")}>Archive</Button>}
          {p.status !== "PROPOSED" && <Button variant="outline" onClick={() => setEdit(fromProject(p))}>Edit</Button>}
        </div>
      </div>
      {p.status === "PROPOSED" && <Alert><AlertTitle>A student proposed this project</AlertTitle><AlertDescription>Approving it opens the project and starts the student&apos;s team. It stays private to them.</AlertDescription></Alert>}
      {p.rejectReason && <Alert variant="destructive"><AlertTitle>Rejected</AlertTitle><AlertDescription>{p.rejectReason}</AlertDescription></Alert>}
      <p className="whitespace-pre-wrap text-sm">{p.problemStatement}</p>
      <div className="flex flex-wrap gap-1">{p.skills.map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}</div>
      <div className="flex items-center justify-between"><h2 className="font-medium">Teams ({p.teams.length})</h2>{isStaff && p.status === "OPEN" && <Button size="sm" onClick={() => setAlloc(true)}>Allocate students</Button>}</div>
      <Table>
        <TableHeader><TableRow><TableHead>Team</TableHead><TableHead>Members</TableHead><TableHead>State</TableHead><TableHead className="w-40">Progress</TableHead><TableHead>Result</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {p.teams.map((t) => <TableRow key={t.id}><TableCell className="font-medium">{t.name}</TableCell><TableCell className="text-sm">{t.members.join(", ")}</TableCell><TableCell><Badge variant={STATUS[t.status]}>{titleCase(t.status)}</Badge></TableCell><TableCell><div className="flex items-center gap-2"><Progress value={t.progress.percent} />{t.progress.overdue > 0 && <span className="text-xs text-destructive">{t.progress.overdue} late</span>}</div></TableCell><TableCell>{t.finalPercent !== null ? `${t.finalPercent}%` : "—"}</TableCell><TableCell><Button size="sm" variant="outline" render={<Link href={`/staff/projects/${id}/teams/${t.id}`} />}>Open</Button></TableCell></TableRow>)}
          {p.teams.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No teams yet.</TableCell></TableRow>}
        </TableBody>
      </Table>

      {edit && <Dialog open onOpenChange={(o) => !o && setEdit(null)}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Edit project</DialogTitle></DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void run("edit", async () => { await api(`/api/projects/${id}`, { method: "PATCH", body: toBody(edit) }); setEdit(null) }, "Saved") }}><ProjectForm v={edit} set={(x) => setEdit((o) => (o ? { ...o, ...x } : o))} canPickGuide={isStaff} /><DialogFooter><Button type="submit" disabled={busy === "edit"}>{busy === "edit" && <Spinner />}Save</Button></DialogFooter></form></DialogContent></Dialog>}
      {reject !== null && <Dialog open onOpenChange={(o) => !o && setReject(null)}><DialogContent><DialogHeader><DialogTitle>Reject this proposal</DialogTitle></DialogHeader>
        <Textarea aria-label="Reason" placeholder="Why is it not approved? The student will see this." value={reject} onChange={(e) => setReject(e.target.value)} /><DialogFooter><Button variant="destructive" disabled={reject.trim().length < 3} onClick={() => { const r = reject; setReject(null); void act("REJECT", "Rejected", r) }}>Reject</Button></DialogFooter></DialogContent></Dialog>}
      {alloc && <Allocate id={id} onClose={() => setAlloc(false)} onDone={() => { setAlloc(false); reload() }} />}
    </div>
  )
}

function Allocate({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const [ids, setIds] = React.useState<{ id: string; label: string }[]>([])
  const [pick, setPick] = React.useState("")
  const [name, setName] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  async function add(studentId: string) {
    if (!studentId || ids.some((x) => x.id === studentId)) return
    try { const s = await api<{ name: string; enrollmentNo: string }>(`/api/students/${studentId}`); setIds((a) => [...a, { id: studentId, label: `${s.name} (${s.enrollmentNo})` }]) } catch { setIds((a) => [...a, { id: studentId, label: studentId.slice(0, 8) }]) }
    setPick("")
  }
  async function save() {
    setBusy(true)
    try { await api(`/api/projects/${id}/teams`, { method: "POST", body: { studentIds: ids.map((x) => x.id), ...(name ? { name } : {}) } }); toast.success("Team created and told"); onDone() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Allocate students to a team</DialogTitle></DialogHeader>
        <FieldGroup>
          <Field><FieldLabel>Add a student</FieldLabel><StudentPicker value={pick} onChange={(v) => { setPick(v); void add(v) }} /></Field>
          <div className="flex flex-wrap gap-1">{ids.map((x) => <Badge key={x.id} variant="secondary" className="cursor-pointer" onClick={() => setIds((a) => a.filter((y) => y.id !== x.id))}>{x.label} ×</Badge>)}{ids.length === 0 && <span className="text-sm text-muted-foreground">No students yet. The first one added is the leader.</span>}</div>
          <Field><FieldLabel htmlFor="t-name">Team name (optional)</FieldLabel><Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        </FieldGroup>
        <DialogFooter><Button disabled={busy || ids.length === 0} onClick={save}>{busy && <Spinner />}Create team</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
