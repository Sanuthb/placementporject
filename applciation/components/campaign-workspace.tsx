"use client"

import * as React from "react"
import { toast } from "sonner"

import { CampaignMember } from "@/components/campaign-member"
import { Compare } from "@/components/match-board"
import { StudentPicker } from "@/components/master-tab"
import { OptionSelect } from "@/components/option-select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { windowDays } from "@/lib/campaign"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, fmtDateTime, titleCase } from "@/lib/web/format"
import { useLookups } from "@/lib/web/lookups"
import { useApi } from "@/lib/web/use-api"

type Cfg = { mockTests: { scheduleId: string; title: string; date: string | null; kind: string }[]; mockInterviews: { title: string; date: string | null; kind: string }[]; resourceIds: string[]; milestones: { title: string; dueAt: string }[]; notify: { email: boolean; remindBehind: boolean } }
type Row = { id: string; studentId: string; name: string; enrollmentNo: string; department: string; group: string | null; groupId: string | null; status: string; addedManually: boolean; progress: { percent: number; overdue: number; behind: boolean; total: number; done: number }; helpOpen: boolean; ready: boolean; scoreThen: number | null; scoreNow: number | null; declineReason: string | null }
type Fig = { selected: number; invited: number; accepted: number; declined: number; awaitingReply: number; started: number; resourcesCompleted: number; resourcesTotal: number; mockTestsCompleted: number; mockTestsTotal: number; mockInterviewsCompleted: number; mockInterviewsTotal: number; needingHelp: number; behind: number; ready: number; averageProgress: number | null; averageScoreChange: number | null }
type Camp = {
  id: string; name: string; company: string; jobRole: string; description: string | null; status: string; startsAt: string; deadline: string; jdId: string; trainers: { id: string; name: string }[]; groups: { id: string; name: string; trainerId: string | null }[]
  config: Cfg; canManage: boolean; problems: string[]; figures: Fig; members: Row[]
}
type Cand = { studentId: string; name: string; enrollmentNo: string; department: string; score: number; mandatoryStatus: string; skills: { matched: string[]; partial: string[]; missing: string[] }; cgpa: number | null }
const d10 = (d: string) => d.slice(0, 10)
const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = { ACCEPTED: "default", INVITED: "secondary", DECLINED: "destructive", SELECTED: "outline", REMOVED: "outline" }
const Stat = ({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) => <Card size="sm"><CardHeader><CardDescription>{label}</CardDescription><CardTitle className="text-2xl">{value}</CardTitle>{sub && <CardDescription>{sub}</CardDescription>}</CardHeader></Card>

/** The campaign workspace: dashboard, candidates (recommended by the matching engine), schedule and setup, groups, and history. */
export function CampaignWorkspace({ id }: { id: string }) {
  const { data: c, reload } = useApi<Camp>(`/api/campaigns/${id}`)
  const [open, setOpen] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  if (!c) return <Skeleton className="h-96" />
  const f = c.figures
  async function run(key: string, fn: () => Promise<unknown>, ok?: string) { setBusy(key); try { await fn(); if (ok) toast.success(ok); reload() } catch (e) { toastError(e) } finally { setBusy(null) } }
  const status = (action: string, ok: string) => run("status", () => api(`/api/campaigns/${id}/status`, { method: "POST", body: { action } }), ok)
  const live = c.members.filter((m) => m.status !== "REMOVED")
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex items-center gap-2"><h1 className="text-xl font-semibold">{c.name}</h1><Badge variant={c.status === "ACTIVE" ? "default" : "outline"}>{titleCase(c.status)}</Badge></div><p className="text-sm text-muted-foreground">{c.jobRole} at {c.company} · {fmtDate(c.startsAt)} to {fmtDate(c.deadline)} · {windowDays(new Date(c.startsAt), new Date(c.deadline))} days{c.trainers.length ? ` · trainers: ${c.trainers.map((t) => t.name).join(", ")}` : ""}</p></div>
        {c.canManage && <div className="flex flex-wrap gap-2">
          {c.status === "DRAFT" && <Button disabled={!!busy || c.problems.length > 0} onClick={() => status("ACTIVATE", "Campaign is active. You can invite candidates")}>Activate</Button>}
          {c.status === "ACTIVE" && <Button disabled={!!busy || f.selected - f.invited === 0} onClick={() => run("invite", async () => { const r = await api<{ invited: number }>(`/api/campaigns/${id}/invite`, { method: "POST", body: {} }); toast.success(`${r.invited} invited`) })}>{busy === "invite" && <Spinner />}Invite all selected ({f.selected - f.invited})</Button>}
          {c.status === "ACTIVE" && <Button variant="outline" disabled={!!busy || f.behind === 0} onClick={() => run("remind", async () => { const r = await api<{ reminded: number }>(`/api/campaigns/${id}/remind`, { method: "POST" }); toast.success(`${r.reminded} reminded`) })}>Remind students behind ({f.behind})</Button>}
          {c.status === "ACTIVE" && <Button variant="outline" disabled={!!busy} onClick={() => status("COMPLETE", "Campaign completed")}>Complete</Button>}
          {(c.status === "DRAFT" || c.status === "ACTIVE") && <Button variant="ghost" disabled={!!busy} onClick={() => status("CANCEL", "Campaign cancelled")}>Cancel</Button>}
        </div>}
      </div>
      {c.status === "DRAFT" && c.problems.length > 0 && <Alert><AlertTitle>Before you can activate</AlertTitle><AlertDescription><ul className="list-disc pl-5">{c.problems.map((p) => <li key={p}>{p}</li>)}</ul></AlertDescription></Alert>}

      <Tabs defaultValue="dashboard">
        <TabsList><TabsTrigger value="dashboard">Dashboard</TabsTrigger><TabsTrigger value="candidates">Candidates</TabsTrigger>{c.canManage && <TabsTrigger value="setup">Schedule and setup</TabsTrigger>}{c.canManage && <TabsTrigger value="groups">Groups</TabsTrigger>}<TabsTrigger value="history">History</TabsTrigger></TabsList>

        <TabsContent value="dashboard" className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Selected" value={f.selected} /><Stat label="Invited" value={f.invited} sub={`${f.awaitingReply} waiting for an answer`} /><Stat label="Accepted" value={f.accepted} /><Stat label="Declined" value={f.declined} /><Stat label="Preparation started" value={f.started} />
            <Stat label="Resources completed" value={`${f.resourcesCompleted}/${f.resourcesTotal}`} /><Stat label="Mock tests completed" value={`${f.mockTestsCompleted}/${f.mockTestsTotal}`} /><Stat label="Mock interviews completed" value={`${f.mockInterviewsCompleted}/${f.mockInterviewsTotal}`} /><Stat label="Need support" value={f.needingHelp} /><Stat label="Ready for the final interview" value={f.ready} />
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3"><Stat label="Falling behind" value={f.behind} /><Stat label="Average progress" value={f.averageProgress === null ? "—" : `${f.averageProgress}%`} /><Stat label="Match score change" value={f.averageScoreChange === null ? "—" : `${f.averageScoreChange > 0 ? "+" : ""}${f.averageScoreChange} points`} sub="invited then, now" /></div>
          <Table>
            <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>State</TableHead><TableHead className="w-44">Progress</TableHead><TableHead>Match then to now</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {live.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.name}<div className="text-xs font-normal text-muted-foreground">{m.department} · {m.enrollmentNo}{m.group ? ` · ${m.group}` : ""}</div></TableCell>
                  <TableCell><div className="flex flex-wrap gap-1"><Badge variant={STATUS_VARIANT[m.status]}>{titleCase(m.status)}</Badge>{m.progress.behind && <Badge variant="destructive">Behind</Badge>}{m.helpOpen && <Badge variant="destructive">Needs support</Badge>}{m.ready && <Badge>Ready</Badge>}</div></TableCell>
                  <TableCell>{m.status === "ACCEPTED" ? <div className="flex items-center gap-2"><Progress value={m.progress.percent} /><span className="text-xs text-muted-foreground">{m.progress.done}/{m.progress.total}</span></div> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                  <TableCell>{m.scoreThen === null ? "—" : `${m.scoreThen}% → ${m.scoreNow ?? "…"}${m.scoreNow !== null ? "%" : ""}`}</TableCell>
                  <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setOpen(m.id)}>Open</Button></TableCell>
                </TableRow>
              ))}
              {live.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No candidates yet. Add some under Candidates.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="candidates"><Candidates c={c} reload={reload} canManage={c.canManage} /></TabsContent>
        {c.canManage && <TabsContent value="setup"><Setup c={c} reload={reload} /></TabsContent>}
        {c.canManage && <TabsContent value="groups"><Groups c={c} reload={reload} /></TabsContent>}
        <TabsContent value="history"><History id={id} /></TabsContent>
      </Tabs>
      {open && <CampaignMember campaignId={id} memberId={open} canManage={c.canManage} days={windowDays(new Date(c.startsAt), new Date(c.deadline))} onClose={() => setOpen(null)} onChanged={reload} />}
    </div>
  )
}

function Candidates({ c, reload, canManage }: { c: Camp; reload: () => void; canManage: boolean }) {
  const lk = useLookups()
  const [dept, setDept] = React.useState("")
  const [min, setMin] = React.useState("0")
  const rec = useApi<{ truncated: boolean; candidates: Cand[] }>(canManage ? `/api/campaigns/${c.id}/candidates` : null, { departmentId: dept || undefined, minScore: Number(min) || 0 })
  const [pick, setPick] = React.useState<Set<string>>(new Set())
  const [group, setGroup] = React.useState("")
  const [cmp, setCmp] = React.useState(false)
  const [manual, setManual] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const toggle = (k: string) => setPick((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else if (n.size < 300) n.add(k); return n })
  async function add(ids: string[]) {
    setBusy(true)
    try { const r = await api<{ added: number; addedManually: number }>(`/api/campaigns/${c.id}/candidates`, { method: "POST", body: { studentIds: ids, groupId: group || null } }); toast.success(`${r.added} added${r.addedManually ? `, ${r.addedManually} by hand (not eligible by the rules)` : ""}`); setPick(new Set()); setManual(""); rec.reload(); reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  const members = c.members.filter((m) => m.status !== "REMOVED")
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2"><h2 className="font-medium">In this campaign ({members.length})</h2>
        <Table><TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Group</TableHead><TableHead>State</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>{members.map((m) => <TableRow key={m.id}><TableCell className="font-medium">{m.name}<div className="text-xs font-normal text-muted-foreground">{m.department} · {m.enrollmentNo}{m.addedManually ? " · added by hand" : ""}</div></TableCell>
            <TableCell>{canManage ? <OptionSelect className="w-40" value={m.groupId ?? ""} onChange={(v) => api(`/api/campaigns/${c.id}/members/${m.id}`, { method: "PATCH", body: { groupId: v || null } }).then(reload, toastError)} options={[{ value: "", label: "No group" }, ...c.groups.map((g) => ({ value: g.id, label: g.name }))]} placeholder="No group" /> : (m.group ?? "—")}</TableCell>
            <TableCell><Badge variant={STATUS_VARIANT[m.status]}>{titleCase(m.status)}</Badge></TableCell>
            <TableCell className="flex justify-end gap-1">{canManage && c.status === "ACTIVE" && m.status === "SELECTED" && <Button size="sm" variant="outline" onClick={() => api(`/api/campaigns/${c.id}/invite`, { method: "POST", body: { memberIds: [m.id] } }).then(() => { toast.success("Invited"); reload() }, toastError)}>Invite</Button>}{canManage && <Button size="sm" variant="ghost" onClick={() => api(`/api/campaigns/${c.id}/members/${m.id}`, { method: "DELETE" }).then(() => { toast.success("Removed"); rec.reload(); reload() }, toastError)}>Remove</Button>}</TableCell></TableRow>)}
            {members.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Nobody yet.</TableCell></TableRow>}</TableBody></Table>
      </section>

      {canManage && c.status !== "COMPLETED" && c.status !== "CANCELLED" && (
        <section className="flex flex-col gap-3"><h2 className="font-medium">Recommended by the matching engine</h2>
          <p className="text-sm text-muted-foreground">Students who pass the eligibility rules, best match first, leaving out those already here. Compare two to four, then add them.</p>
          <div className="flex flex-wrap items-end gap-3">
            <OptionSelect className="w-52" value={dept} onChange={setDept} options={[{ value: "", label: "All departments" }, ...lk.departments]} placeholder="All departments" />
            <Field className="w-36"><FieldLabel htmlFor="min">Lowest match score</FieldLabel><Input id="min" type="number" min={0} max={100} value={min} onChange={(e) => setMin(e.target.value)} /></Field>
            <OptionSelect className="w-44" value={group} onChange={setGroup} options={[{ value: "", label: "No group" }, ...c.groups.map((g) => ({ value: g.id, label: `Into ${g.name}` }))]} placeholder="No group" />
            <div className="ml-auto flex gap-2"><Button variant="outline" disabled={pick.size < 2 || pick.size > 4} onClick={() => setCmp(true)}>Compare ({pick.size})</Button><Button disabled={pick.size === 0 || busy} onClick={() => add([...pick])}>{busy && <Spinner />}Add {pick.size || ""}</Button></div>
          </div>
          {!rec.data ? <Skeleton className="h-40" /> : (
            <Table><TableHeader><TableRow><TableHead /><TableHead>Student</TableHead><TableHead className="w-40">Match</TableHead><TableHead>Skills</TableHead></TableRow></TableHeader>
              <TableBody>{rec.data.candidates.slice(0, 200).map((x) => <TableRow key={x.studentId}><TableCell><Checkbox aria-label={`Select ${x.name}`} checked={pick.has(x.studentId)} onCheckedChange={() => toggle(x.studentId)} /></TableCell><TableCell className="font-medium">{x.name}<div className="text-xs font-normal text-muted-foreground">{x.department} · {x.enrollmentNo}{x.cgpa !== null ? ` · CGPA ${x.cgpa}` : ""}</div></TableCell><TableCell><div className="flex items-center gap-2"><Progress value={x.score} />{x.score}</div></TableCell><TableCell className="text-xs">{x.skills.matched.length} matched{x.skills.partial.length ? `, ${x.skills.partial.length} partly` : ""}{x.skills.missing.length ? `, ${x.skills.missing.length} missing` : ""}{x.skills.missing.length > 0 && <div className="text-muted-foreground">{x.skills.missing.slice(0, 3).join(", ")}</div>}</TableCell></TableRow>)}
                {rec.data.candidates.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No more recommended students match these filters.</TableCell></TableRow>}</TableBody></Table>
          )}
          <div className="flex max-w-md flex-col gap-1"><span className="text-sm font-medium">Add someone by hand</span><StudentPicker value={manual} onChange={setManual} /><div><Button size="sm" variant="outline" disabled={!manual || busy} onClick={() => add([manual])}>Add this student</Button></div><span className="text-xs text-muted-foreground">A student who does not pass the eligibility rules can still be added; they are marked as added by hand.</span></div>
        </section>
      )}
      {cmp && <Compare jdId={c.jdId} ids={[...pick]} onClose={() => setCmp(false)} />}
    </div>
  )
}

function Setup({ c, reload }: { c: Camp; reload: () => void }) {
  const schedules = useApi<{ id: string; title: string; startsAt: string; isPractice: boolean; paper: { title: string } }[]>("/api/assessments/schedules")
  const resources = useApi<{ id: string; title: string }[]>("/api/resources", { status: "APPROVED" })
  const trainers = useApi<{ id: string; name: string }[]>("/api/projects/guides")
  const [f, setF] = React.useState({ name: c.name, description: c.description ?? "", startsAt: d10(c.startsAt), deadline: d10(c.deadline), trainerIds: c.trainers.map((t) => t.id) })
  const [cfg, setCfg] = React.useState<Cfg>(c.config)
  const [busy, setBusy] = React.useState(false)
  const over = c.status === "COMPLETED" || c.status === "CANCELLED"
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    try { await api(`/api/campaigns/${c.id}`, { method: "PATCH", body: { name: f.name, description: f.description || null, startsAt: new Date(f.startsAt).toISOString(), deadline: new Date(f.deadline).toISOString(), trainerIds: f.trainerIds, config: cfg } }); toast.success("Saved. Plans already made are not changed: use \"Make the plan again\" on a student"); reload() } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  const tog = (id: string) => setF((o) => ({ ...o, trainerIds: o.trainerIds.includes(id) ? o.trainerIds.filter((x) => x !== id) : [...o.trainerIds, id] }))
  return (
    <form onSubmit={save} className="flex max-w-3xl flex-col gap-5">
      <fieldset disabled={over} className="contents"><FieldGroup>
        <Field><FieldLabel htmlFor="cn">Campaign name</FieldLabel><Input id="cn" required minLength={3} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field><FieldLabel htmlFor="cd">What students should know (shown in the invitation)</FieldLabel><Textarea id="cd" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2"><Field><FieldLabel htmlFor="cs">Preparation starts</FieldLabel><Input id="cs" type="date" required value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></Field><Field><FieldLabel htmlFor="ce">Preparation deadline</FieldLabel><Input id="ce" type="date" required value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} /></Field></div>
        <div className="flex flex-col gap-1 text-sm"><span className="font-medium">Trainers (they can follow candidates, edit plans and answer support requests)</span><div className="flex flex-wrap gap-3">{(trainers.data ?? []).map((t) => <label key={t.id} className="flex items-center gap-1"><Checkbox checked={f.trainerIds.includes(t.id)} onCheckedChange={() => tog(t.id)} />{t.name}</label>)}</div></div>

        <div className="flex flex-col gap-2 text-sm"><span className="font-medium">Mock tests</span><p className="text-xs text-muted-foreground">Choose from the assessments you scheduled. Students must be in the test&apos;s audience to take it.</p>
          {cfg.mockTests.map((t, i) => <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border p-2"><span className="flex-1">{t.title}</span><Input aria-label="Date" className="w-40" type="date" value={t.date ? t.date.slice(0, 10) : ""} onChange={(e) => setCfg({ ...cfg, mockTests: cfg.mockTests.map((x, j) => (j === i ? { ...x, date: e.target.value ? new Date(e.target.value).toISOString() : null } : x)) })} /><OptionSelect className="w-36" value={t.kind} onChange={(v) => setCfg({ ...cfg, mockTests: cfg.mockTests.map((x, j) => (j === i ? { ...x, kind: v } : x)) })} options={[{ value: "APTITUDE", label: "Aptitude" }, { value: "TECHNICAL", label: "Technical" }, { value: "OTHER", label: "Other" }]} placeholder="Kind" /><Button type="button" size="sm" variant="ghost" onClick={() => setCfg({ ...cfg, mockTests: cfg.mockTests.filter((_, j) => j !== i) })}>Remove</Button></div>)}
          <OptionSelect className="w-80" value="" onChange={(v) => { const s = schedules.data?.find((x) => x.id === v); if (s && !cfg.mockTests.some((t) => t.scheduleId === v)) setCfg({ ...cfg, mockTests: [...cfg.mockTests, { scheduleId: v, title: s.title, date: s.startsAt, kind: "OTHER" }] }) }} options={(schedules.data ?? []).map((s) => ({ value: s.id, label: `${s.title} (${s.paper.title})` }))} placeholder="Add a scheduled assessment" /></div>

        <div className="flex flex-col gap-2 text-sm"><span className="font-medium">Mock interviews</span><p className="text-xs text-muted-foreground">Practice interviews are taken in the students&apos; Preparation page and tick themselves when finished. A technical and an HR one are added to every plan unless you schedule your own.</p>
          {cfg.mockInterviews.map((t, i) => <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border p-2"><Input aria-label="Title" className="min-w-40 flex-1" value={t.title} onChange={(e) => setCfg({ ...cfg, mockInterviews: cfg.mockInterviews.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} /><Input aria-label="Date" className="w-40" type="date" value={t.date ? t.date.slice(0, 10) : ""} onChange={(e) => setCfg({ ...cfg, mockInterviews: cfg.mockInterviews.map((x, j) => (j === i ? { ...x, date: e.target.value ? new Date(e.target.value).toISOString() : null } : x)) })} /><OptionSelect className="w-32" value={t.kind} onChange={(v) => setCfg({ ...cfg, mockInterviews: cfg.mockInterviews.map((x, j) => (j === i ? { ...x, kind: v } : x)) })} options={[{ value: "TECHNICAL", label: "Technical" }, { value: "HR", label: "HR" }]} placeholder="Kind" /><Button type="button" size="sm" variant="ghost" onClick={() => setCfg({ ...cfg, mockInterviews: cfg.mockInterviews.filter((_, j) => j !== i) })}>Remove</Button></div>)}
          <div><Button type="button" size="sm" variant="outline" onClick={() => setCfg({ ...cfg, mockInterviews: [...cfg.mockInterviews, { title: "Technical mock interview", date: null, kind: "TECHNICAL" }] })}>Add a mock interview</Button></div></div>

        <div className="flex flex-col gap-1 text-sm"><span className="font-medium">Study material for everyone in this campaign</span><div className="flex flex-wrap gap-3">{(resources.data ?? []).slice(0, 60).map((r) => <label key={r.id} className="flex items-center gap-1"><Checkbox checked={cfg.resourceIds.includes(r.id)} onCheckedChange={() => setCfg({ ...cfg, resourceIds: cfg.resourceIds.includes(r.id) ? cfg.resourceIds.filter((x) => x !== r.id) : [...cfg.resourceIds, r.id].slice(0, 30) })} />{r.title}</label>)}{resources.data?.length === 0 && <span className="text-muted-foreground">No approved study material yet.</span>}</div></div>

        <div className="flex flex-col gap-2 text-sm"><span className="font-medium">Milestones</span>
          {cfg.milestones.map((m, i) => <div key={i} className="flex flex-wrap items-center gap-2"><Input aria-label="Milestone" className="min-w-48 flex-1" value={m.title} onChange={(e) => setCfg({ ...cfg, milestones: cfg.milestones.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} /><Input aria-label="Due" className="w-40" type="date" value={m.dueAt.slice(0, 10)} onChange={(e) => setCfg({ ...cfg, milestones: cfg.milestones.map((x, j) => (j === i ? { ...x, dueAt: e.target.value ? new Date(e.target.value).toISOString() : x.dueAt } : x)) })} /><Button type="button" size="sm" variant="ghost" onClick={() => setCfg({ ...cfg, milestones: cfg.milestones.filter((_, j) => j !== i) })}>Remove</Button></div>)}
          <div><Button type="button" size="sm" variant="outline" onClick={() => setCfg({ ...cfg, milestones: [...cfg.milestones, { title: "", dueAt: new Date(c.deadline).toISOString() }] })}>Add a milestone</Button></div></div>

        <label className="flex items-center gap-2 text-sm"><Switch checked={cfg.notify.email} onCheckedChange={(v) => setCfg({ ...cfg, notify: { ...cfg.notify, email: v } })} />Also email invitations (to students who take emails)</label>
        <label className="flex items-center gap-2 text-sm"><Switch checked={cfg.notify.remindBehind} onCheckedChange={(v) => setCfg({ ...cfg, notify: { ...cfg.notify, remindBehind: v } })} />Allow reminders to students who fall behind</label>
      </FieldGroup></fieldset>
      {!over && <div><Button type="submit" disabled={busy}>{busy && <Spinner />}Save</Button></div>}
    </form>
  )
}

function Groups({ c, reload }: { c: Camp; reload: () => void }) {
  const trainers = useApi<{ id: string; name: string }[]>("/api/projects/guides")
  const [name, setName] = React.useState("")
  const [trainer, setTrainer] = React.useState("")
  return (
    <div className="flex max-w-2xl flex-col gap-3 text-sm">
      <p className="text-muted-foreground">Groups let you give different trainers different candidates. Move candidates into a group from the Candidates tab.</p>
      {c.groups.map((g) => <div key={g.id} className="flex items-center justify-between gap-2 rounded-md border p-2"><span className="font-medium">{g.name} <span className="font-normal text-muted-foreground">· {c.members.filter((m) => m.groupId === g.id && m.status !== "REMOVED").length} students{g.trainerId ? ` · trainer ${trainers.data?.find((t) => t.id === g.trainerId)?.name ?? ""}` : ""}</span></span><Button size="sm" variant="ghost" onClick={() => api(`/api/campaigns/${c.id}/groups/${g.id}`, { method: "DELETE" }).then(() => { toast.success("Group deleted"); reload() }, toastError)}>Delete</Button></div>)}
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); api(`/api/campaigns/${c.id}/groups`, { method: "POST", body: { name, trainerId: trainer || null } }).then(() => { setName(""); toast.success("Group added"); reload() }, toastError) }}>
        <Field className="w-56"><FieldLabel htmlFor="gn">New group</FieldLabel><Input id="gn" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <OptionSelect className="w-48" value={trainer} onChange={setTrainer} options={[{ value: "", label: "No trainer" }, ...(trainers.data ?? []).map((t) => ({ value: t.id, label: t.name }))]} placeholder="No trainer" /><Button type="submit" variant="outline">Add group</Button></form>
    </div>
  )
}

function History({ id }: { id: string }) {
  const { data } = useApi<{ id: string; action: string; at: string; by: string; student: string | null; detail: Record<string, unknown> }[]>(`/api/campaigns/${id}/events`)
  if (!data) return <Skeleton className="h-40" />
  return <div className="flex max-w-3xl flex-col gap-1 text-sm">{data.map((e) => <div key={e.id} className="flex flex-wrap justify-between gap-2 border-b py-1"><span>{e.action.replaceAll("_", " ").replaceAll(".", ": ")}{e.student ? ` · ${e.student}` : ""}</span><span className="text-xs text-muted-foreground">{e.by} · {fmtDateTime(e.at)}</span></div>)}{data.length === 0 && <span className="text-muted-foreground">Nothing yet.</span>}</div>
}
