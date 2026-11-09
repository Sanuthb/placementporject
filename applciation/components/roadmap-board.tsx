"use client"

import * as React from "react"
import { CheckIcon, PlusIcon, PrinterIcon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, fmtDateTime } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"
import { CATEGORIES, PHASES, categoryName, phaseLabel } from "@/lib/roadmap"
import type { RoadmapView } from "@/lib/roadmapService"

type Mode = "student" | "review"
type Data = RoadmapView
type Milestone = Data["years"][number]["semesters"][number]["milestones"][number]

const STATUS_LABEL: Record<string, string> = { PLANNED: "Planned", IN_PROGRESS: "In progress", DONE: "Done", SKIPPED: "Skipped" }
const BY: Record<string, string> = { AUTO: "automatically", STUDENT: "by the student", MENTOR: "by the mentor", STAFF: "by staff" }

/**
 * The career roadmap. In "student" mode the student can set goals, tick, skip, move and add milestones and accept suggestions; in "review" mode
 * (mentor or staff) it is read-only apart from confirming milestones and leaving notes. Every change is recorded in the history at the bottom.
 */
export function RoadmapBoard({ mode, base, studentName }: { mode: Mode; base: string; studentName?: string }) {
  const raw = useApi<unknown>(base)
  const student = mode === "student"
  const payload = raw.data as (Data & { roadmap: Data["roadmap"] }) | { roadmap: Data | null; student: { name: string; isMentor: boolean } } | undefined
  const data: Data | null = !payload ? null : student ? (payload as Data) : (payload as { roadmap: Data | null }).roadmap
  const reviewer = !student && payload ? (payload as { student: { name: string; isMentor: boolean } }).student : null
  const [busy, setBusy] = React.useState<string | null>(null)
  const [addOpen, setAddOpen] = React.useState<{ semester: number } | null>(null)
  const [goalOpen, setGoalOpen] = React.useState(false)
  const [comment, setComment] = React.useState("")

  if (raw.loading && !raw.data) return <Skeleton className="h-64 rounded-xl" />
  if (!data) return <Alert><AlertTitle>No roadmap yet</AlertTitle><AlertDescription>{studentName ?? "The student"} has not opened their career roadmap yet. It is created the first time they open it, so there is nothing to review.</AlertDescription></Alert>
  const d = data
  const root = "/api/student/roadmap"
  const reload = () => raw.reload()
  const p = d.progress
  const overdue = new Set(p.overdue as unknown as string[]), nextIds = new Set(p.next as unknown as string[])

  async function call(key: string, f: () => Promise<unknown>, ok?: string) {
    setBusy(key)
    try { await f(); if (ok) toast.success(ok); reload() } catch (e) { toastError(e) } finally { setBusy(null) }
  }
  const setStatus = (m: Milestone, status: string) => call(m.id, () => api(student ? `${root}/milestones/${m.id}` : `${base}/milestones/${m.id}`, { method: "PATCH", body: { status } }))
  const move = (m: Milestone, semester: string) => call(m.id, () => api(`${root}/milestones/${m.id}`, { method: "PATCH", body: { semester: Number(semester) } }), "Moved")
  const remove = (m: Milestone) => call(m.id, () => api(`${root}/milestones/${m.id}`, { method: "DELETE" }), "Removed")
  const accept = (key: string) => call(key, () => api(`${root}/milestones`, { method: "POST", body: { title: "Suggested milestone", semester: d.programme.currentSemester, suggestionKey: key } }), "Added to your roadmap")
  const setRole = (role: string) => call("role", () => api(root, { method: "PATCH", body: { targetRole: role } }), "Target role saved")
  const goalStatus = (id: string, status: string) => call(id, () => api(`${root}/goals/${id}`, { method: "PATCH", body: { status } }))
  const postComment = () => call("comment", async () => { await api(`${base}/comments`, { method: "POST", body: { body: comment } }); setComment("") }, "Note sent to the student")

  const semOptions = Array.from({ length: d.roadmap.totalSemesters }, (_, i) => ({ value: String(i + 1), label: `Semester ${i + 1}` }))
  const currentYear = d.years.find((y) => y.semesters.some((s) => s.current))?.year ?? 1

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <h2 className="text-lg font-semibold">{student ? "My career roadmap" : `Career roadmap${studentName ? `: ${studentName}` : ""}`}</h2>
        <Badge variant="outline">{d.programme.programme ?? "Programme"} · {d.programme.years} year{d.programme.years > 1 ? "s" : ""} · semester {d.programme.currentSemester} of {d.roadmap.totalSemesters}</Badge>
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => window.print()}><PrinterIcon />Print or save as PDF</Button>
      </div>

      <Card>
        <CardHeader><CardTitle>{p.percent}% of the plan is done</CardTitle><CardDescription>{p.done} of {p.total} milestones done{p.overdue.length ? `, ${p.overdue.length} from earlier semesters still open` : ". On track"}.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <Progress value={p.percent} aria-label="Overall progress" />
          <div className="grid gap-2 sm:grid-cols-4">
            {PHASES.map((ph) => { const b = p.byPhase.find((x) => x.phase === ph.key)!; return <div key={ph.key} className="flex flex-col gap-1"><span className="font-medium">{ph.label}</span><Progress value={b.total ? Math.round((b.done / b.total) * 100) : 0} aria-label={`${ph.label} progress`} /><span className="text-xs text-muted-foreground">{b.done} of {b.total}</span></div> })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Career goal and target role</CardTitle><CardDescription>{student ? "Where do you want to be? You can change this whenever you like." : "What the student is aiming for."}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {student ? <RoleEditor current={d.roadmap.targetRole} roles={d.roles} busy={busy === "role"} onSave={setRole} /> : <div><span className="text-muted-foreground">Target role: </span>{d.roadmap.targetRole ?? "not chosen yet"}</div>}
            {!student && d.roadmap.careerGoal && <div><span className="text-muted-foreground">Goal: </span>{d.roadmap.careerGoal}</div>}
            {student && <GoalStatement current={d.roadmap.careerGoal} onSave={(v) => call("goal-text", () => api(root, { method: "PATCH", body: { careerGoal: v } }), "Saved")} busy={busy === "goal-text"} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Goals</CardTitle><CardDescription>Specific things to achieve.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {d.goals.length === 0 && <span className="text-muted-foreground">No goals set yet.</span>}
            {d.goals.map((g) => (
              <div key={g.id} className="flex flex-wrap items-center gap-2">
                <Badge variant={g.status === "ACHIEVED" ? "default" : g.status === "DROPPED" ? "outline" : "secondary"}>{g.status === "OPEN" ? "Open" : g.status === "ACHIEVED" ? "Achieved" : "Dropped"}</Badge>
                <span className={g.status === "DROPPED" ? "text-muted-foreground line-through" : ""}>{g.title}{g.targetDate ? ` (by ${fmtDate(g.targetDate)})` : ""}</span>
                {student && g.status === "OPEN" && <span className="ml-auto flex gap-1"><Button size="sm" variant="outline" disabled={busy === g.id} onClick={() => goalStatus(g.id, "ACHIEVED")}>Achieved</Button><Button size="sm" variant="ghost" disabled={busy === g.id} onClick={() => goalStatus(g.id, "DROPPED")}>Drop</Button></span>}
              </div>
            ))}
            {student && <div><Button size="sm" variant="outline" onClick={() => setGoalOpen(true)}><PlusIcon />Add a goal</Button></div>}
          </CardContent>
        </Card>
      </div>

      {student && d.suggestions.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><SparklesIcon className="size-4" />Suggested for you</CardTitle><CardDescription>Worked out from your assessment results. Add the ones you want.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {d.suggestions.map((s) => (
              <div key={s.key} className="flex flex-wrap items-center gap-2 border-b pb-2 last:border-0">
                <div className="min-w-0 flex-1"><div className="font-medium">{s.title}</div><div className="text-muted-foreground">{s.why} {s.description}</div></div>
                <Button size="sm" disabled={busy === s.key} onClick={() => accept(s.key)}>{busy === s.key && <Spinner />}Add to semester {s.semester}</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {d.comments.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Notes from the mentor and the placement cell</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {d.comments.map((c) => <div key={c.id} className="border-b pb-2 last:border-0"><div className="text-xs text-muted-foreground">{c.authorName} ({c.authorRole === "MENTOR" ? "mentor" : "placement cell"}) · {fmtDateTime(c.createdAt)}</div><div>{c.body}</div></div>)}
          </CardContent>
        </Card>
      )}
      {!student && (
        <Card className="print:hidden">
          <CardHeader><CardTitle>Leave a note</CardTitle><CardDescription>{reviewer?.isMentor ? "You are this student's mentor." : "The student sees this on their roadmap."}</CardDescription></CardHeader>
          <CardContent className="flex flex-col items-start gap-2">
            <Textarea aria-label="Note to the student" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Encouragement, a suggestion, or what to focus on next" />
            <Button disabled={busy === "comment" || comment.trim().length < 2} onClick={postComment}>{busy === "comment" && <Spinner />}Send note</Button>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue={String(currentYear)}>
        <TabsList className="print:hidden">{d.years.map((y) => <TabsTrigger key={y.year} value={String(y.year)}>Year {y.year}</TabsTrigger>)}</TabsList>
        {d.years.map((y) => (
          <TabsContent key={y.year} value={String(y.year)} className="flex flex-col gap-3">
            {y.semesters.map((s) => {
              const phases = [...new Set(s.milestones.map((m) => m.phase))]
              return (
                <Card key={s.semester} className={s.current ? "border-primary/50" : ""}>
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-2">Semester {s.semester} {s.current && <Badge>Now</Badge>}{phases.map((ph) => <Badge key={ph} variant="outline">{phaseLabel(ph)}</Badge>)}</CardTitle>
                    {phases[0] && <CardDescription>{PHASES.find((x) => x.key === phases[0])?.summary}</CardDescription>}
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2 text-sm">
                    {s.milestones.length === 0 && <span className="text-muted-foreground">Nothing planned for this semester.</span>}
                    {s.milestones.map((m) => (
                      <div key={m.id} className={`flex flex-col gap-1 rounded-lg border p-2 ${m.status === "SKIPPED" ? "opacity-60" : ""}`}>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={m.status === "DONE" ? "default" : m.status === "IN_PROGRESS" ? "secondary" : "outline"}>{m.status === "DONE" && <CheckIcon className="size-3" />}{STATUS_LABEL[m.status]}</Badge>
                          <span className={`font-medium ${m.status === "SKIPPED" ? "line-through" : ""}`}>{m.title}</span>
                          <Badge variant="outline">{categoryName(m.category)}</Badge>
                          {m.source === "RECOMMENDED" && <Badge variant="secondary">Suggested</Badge>}{m.source === "CUSTOM" && <Badge variant="secondary">Own</Badge>}
                          {overdue.has(m.id) && <Badge variant="destructive">Earlier semester</Badge>}{nextIds.has(m.id) && <Badge variant="secondary">Up next</Badge>}
                        </div>
                        {m.description && <span className="text-muted-foreground">{m.description}</span>}
                        {m.auto && m.status !== "DONE" && <span className="text-xs text-muted-foreground">{d.autoRules[m.auto]}</span>}
                        {m.status === "DONE" && m.completedAt && <span className="text-xs text-muted-foreground">Done {fmtDate(m.completedAt)}{m.completedBy ? ` ${BY[m.completedBy] ?? ""}` : ""}</span>}
                        <div className="flex flex-wrap items-center gap-1 print:hidden">
                          {m.status !== "DONE" && m.status !== "SKIPPED" && (!student || !m.auto) && (student || reviewer) && <Button size="sm" disabled={busy === m.id} onClick={() => setStatus(m, "DONE")}>{student ? "Mark done" : "Confirm done"}</Button>}
                          {student && m.status === "PLANNED" && <Button size="sm" variant="outline" disabled={busy === m.id} onClick={() => setStatus(m, "IN_PROGRESS")}>Started</Button>}
                          {student && m.status !== "SKIPPED" && m.status !== "DONE" && <Button size="sm" variant="ghost" disabled={busy === m.id} onClick={() => setStatus(m, "SKIPPED")}>Skip</Button>}
                          {student && m.status === "SKIPPED" && <Button size="sm" variant="outline" disabled={busy === m.id} onClick={() => setStatus(m, "PLANNED")}>Restore</Button>}
                          {!student && m.status === "DONE" && m.completedBy !== "AUTO" && <Button size="sm" variant="ghost" disabled={busy === m.id} onClick={() => setStatus(m, "PLANNED")}>Reopen</Button>}
                          {student && m.status !== "DONE" && <OptionSelect className="h-7 w-36" value={String(m.semester)} onChange={(v) => v && Number(v) !== m.semester && move(m, v)} options={semOptions} placeholder="Move to" />}
                          {student && m.source !== "TEMPLATE" && <Button size="sm" variant="ghost" disabled={busy === m.id} onClick={() => remove(m)}>Remove</Button>}
                        </div>
                      </div>
                    ))}
                    {student && <div className="print:hidden"><Button size="sm" variant="outline" onClick={() => setAddOpen({ semester: s.semester })}><PlusIcon />Add a milestone</Button></div>}
                  </CardContent>
                </Card>
              )
            })}
          </TabsContent>
        ))}
      </Tabs>

      <Collapsible className="print:hidden">
        <CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>History of changes ({d.history.length})</CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-1 pt-2 text-xs text-muted-foreground">
          {d.history.map((e) => <div key={e.id}>{fmtDateTime(e.createdAt)} · {e.actor === "SYSTEM" ? "System" : e.actor === "STUDENT" ? "Student" : e.actor === "MENTOR" ? "Mentor" : "Staff"} · {e.action.replace(/[._]/g, " ")}{(e.detail as { title?: string })?.title ? `: ${(e.detail as { title?: string }).title}` : ""}</div>)}
        </CollapsibleContent>
      </Collapsible>
      <span className="text-xs text-muted-foreground print:hidden">The roadmap is a plan, not a requirement: it never affects eligibility for a drive.</span>

      {student && addOpen && <AddMilestone semester={addOpen.semester} semOptions={semOptions} onClose={() => setAddOpen(null)} onAdded={() => { setAddOpen(null); reload() }} />}
      {student && goalOpen && <AddGoal onClose={() => setGoalOpen(false)} onAdded={() => { setGoalOpen(false); reload() }} />}
    </div>
  )
}

function RoleEditor({ current, roles, busy, onSave }: { current: string | null; roles: { role: string; from: string }[]; busy: boolean; onSave: (role: string) => void }) {
  const [v, setV] = React.useState(current ?? "")
  return (
    <div className="flex flex-col gap-2">
      <Field><FieldLabel htmlFor="target-role">Target role</FieldLabel><div className="flex gap-2"><Input id="target-role" value={v} placeholder="For example: Software engineer" onChange={(e) => setV(e.target.value)} /><Button disabled={busy || v.trim() === (current ?? "")} onClick={() => onSave(v.trim())}>{busy && <Spinner />}Save</Button></div></Field>
      {roles.length > 0 && <div className="flex flex-wrap gap-1">{roles.map((r) => <Button key={r.role} size="sm" variant={v === r.role ? "default" : "outline"} title={r.from} onClick={() => setV(r.role)}>{r.role}</Button>)}</div>}
      {roles.length > 0 && <span className="text-xs text-muted-foreground">Ideas from your interests and preferences. Hover a role to see why. They are ideas to explore, not a prediction.</span>}
    </div>
  )
}

function GoalStatement({ current, onSave, busy }: { current: string | null; onSave: (v: string) => void; busy: boolean }) {
  const [v, setV] = React.useState(current ?? "")
  return <Field><FieldLabel htmlFor="career-goal">My career goal in a sentence</FieldLabel><Textarea id="career-goal" value={v} onChange={(e) => setV(e.target.value)} placeholder="In five years I want to…" /><div><Button size="sm" disabled={busy || v.trim() === (current ?? "")} onClick={() => onSave(v.trim())}>{busy && <Spinner />}Save goal</Button></div></Field>
}

function AddMilestone({ semester, semOptions, onClose, onAdded }: { semester: number; semOptions: { value: string; label: string }[]; onClose: () => void; onAdded: () => void }) {
  const [title, setTitle] = React.useState(""), [desc, setDesc] = React.useState(""), [sem, setSem] = React.useState(String(semester)), [cat, setCat] = React.useState("PERSONAL"), [busy, setBusy] = React.useState(false)
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    try { await api("/api/student/roadmap/milestones", { method: "POST", body: { title, description: desc || undefined, semester: Number(sem), category: cat } }); toast.success("Milestone added"); onAdded() } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add a milestone</DialogTitle></DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-3">
          <Field><FieldLabel htmlFor="m-title">What do you want to do?</FieldLabel><Input id="m-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For example: Finish a SQL course" /></Field>
          <Field><FieldLabel>Semester</FieldLabel><OptionSelect className="w-full" value={sem} onChange={setSem} options={semOptions} placeholder="Semester" /></Field>
          <Field><FieldLabel>Kind</FieldLabel><OptionSelect className="w-full" value={cat} onChange={setCat} options={CATEGORIES.map((c) => ({ value: c, label: categoryName(c) }))} placeholder="Kind" /></Field>
          <Field><FieldLabel htmlFor="m-desc">Details (optional)</FieldLabel><Textarea id="m-desc" value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
          <DialogFooter><Button type="submit" disabled={busy || title.trim().length < 3}>{busy && <Spinner />}Add</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AddGoal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [title, setTitle] = React.useState(""), [date, setDate] = React.useState(""), [busy, setBusy] = React.useState(false)
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    try { await api("/api/student/roadmap/goals", { method: "POST", body: { title, ...(date ? { targetDate: date } : {}) } }); toast.success("Goal added"); onAdded() } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add a goal</DialogTitle></DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-3">
          <Field><FieldLabel htmlFor="g-title">Goal</FieldLabel><Input id="g-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For example: Score 70% in the technical test" /></Field>
          <Field><FieldLabel htmlFor="g-date">Target date (optional)</FieldLabel><Input id="g-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <DialogFooter><Button type="submit" disabled={busy || title.trim().length < 3}>{busy && <Spinner />}Add</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
