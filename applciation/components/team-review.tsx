"use client"

import * as React from "react"
import { toast } from "sonner"

import { CRITERIA, type TeamView } from "@/components/project-types"
import { STATUS } from "@/components/project-manager"
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, fmtDateTime, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

/** A reviewer's view of one team: the work, each member's recorded contribution on its own, repository figures, files, the timeline, reviews and the result. */
export function TeamReview({ projectId, teamId }: { projectId: string; teamId: string }) {
  const base = `/api/projects/${projectId}/teams/${teamId}`
  const { data: t, reload } = useApi<TeamView>(base)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [note, setNote] = React.useState("")
  const [invite, setInvite] = React.useState({ name: "", email: "" })
  const [link, setLink] = React.useState<{ link: string; emailed: boolean } | null>(null)
  if (!t) return <Skeleton className="h-64" />
  async function run(key: string, f: () => Promise<unknown>, ok?: string) { setBusy(key); try { await f(); if (ok) toast.success(ok); reload() } catch (e) { toastError(e) } finally { setBusy(null) } }
  const nameOf = (id: string) => t.members.find((m) => m.studentId === id)?.name ?? "Student"

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex items-center gap-2"><h1 className="text-xl font-semibold">{t.project.title}: {t.name}</h1><Badge variant={STATUS[t.status]}>{titleCase(t.status)}</Badge></div>
          <p className="text-sm text-muted-foreground">{t.members.map((m) => m.name).join(", ")}{t.submittedAt ? ` · submitted ${fmtDate(t.submittedAt)}` : ""}</p></div>
        <div className="w-48"><Progress value={t.progress.percent} /><div className="mt-1 text-xs text-muted-foreground">{t.progress.milestonesDone}/{t.progress.milestonesTotal} milestones · {t.progress.tasksDone}/{t.progress.tasksTotal} tasks{t.progress.overdue ? ` · ${t.progress.overdue} late` : ""}</div></div>
      </div>

      <Tabs defaultValue="work">
        <TabsList><TabsTrigger value="work">Work and contribution</TabsTrigger><TabsTrigger value="files">Files</TabsTrigger><TabsTrigger value="timeline">Timeline ({t.updates.length})</TabsTrigger><TabsTrigger value="reviews">Reviews ({t.reviews.length})</TabsTrigger><TabsTrigger value="result">Result</TabsTrigger></TabsList>

        <TabsContent value="work" className="flex flex-col gap-4">
          <Card size="sm"><CardHeader><CardTitle>Each member&apos;s recorded work</CardTitle><CardDescription>Tasks finished, updates written, files uploaded and commits (matched by the GitHub name each student gave, capped). This is recorded activity, not quality: ask before you conclude anything.</CardDescription></CardHeader>
            <CardContent>
              <Table><TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Tasks done</TableHead><TableHead>Updates</TableHead><TableHead>Files</TableHead><TableHead>Commits</TableHead><TableHead>Share of work</TableHead></TableRow></TableHeader>
                <TableBody>{t.contributions.map((c) => <TableRow key={c.studentId}><TableCell>{c.name} {c.lowContribution && <Badge variant="destructive">Little recorded work</Badge>}</TableCell><TableCell>{c.tasksDone}/{c.tasksAssigned}</TableCell><TableCell>{c.updates}</TableCell><TableCell>{c.files}</TableCell><TableCell>{c.commits}</TableCell><TableCell><div className="flex items-center gap-2"><Progress value={c.sharePercent} />{c.sharePercent}%</div></TableCell></TableRow>)}</TableBody></Table>
            </CardContent></Card>
          <Card size="sm"><CardHeader><CardTitle>GitHub</CardTitle><CardDescription>{t.repoUrl ? <a className="underline underline-offset-4" href={t.repoUrl} target="_blank" rel="noreferrer">{t.repoUrl}</a> : "No repository link yet."}</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {t.repoStats ? <><p>{t.repoStats.totalCommits} commits{t.repoStats.pushedAt ? `, last push ${fmtDate(t.repoStats.pushedAt)}` : ""}. Read {fmtDateTime(t.repoStats.fetchedAt)}.</p><div className="flex flex-wrap gap-2">{t.repoStats.contributors.map((c) => <Badge key={c.login} variant="outline">{c.login}: {c.commits}</Badge>)}</div></> : <p className="text-muted-foreground">Commits have not been read yet.</p>}
              {t.repoUrl && <div><Button size="sm" variant="outline" disabled={busy === "sync"} onClick={() => run("sync", () => api(`${base}/sync`, { method: "POST" }), "Repository read")}>{busy === "sync" && <Spinner />}Read the repository now</Button></div>}
            </CardContent></Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Card size="sm"><CardHeader><CardTitle>Milestones</CardTitle></CardHeader><CardContent className="flex flex-col gap-1 text-sm">{t.milestones.map((m) => <div key={m.id} className="flex justify-between gap-2"><span className={m.doneAt ? "text-muted-foreground line-through" : ""}>{m.title}</span><span className={!m.doneAt && m.dueAt && new Date(m.dueAt) < new Date() ? "text-destructive" : "text-muted-foreground"}>{m.doneAt ? "done" : fmtDate(m.dueAt)}</span></div>)}{t.milestones.length === 0 && <span className="text-muted-foreground">None.</span>}</CardContent></Card>
            <Card size="sm"><CardHeader><CardTitle>Tasks</CardTitle></CardHeader><CardContent className="flex flex-col gap-1 text-sm">{t.tasks.map((k) => <div key={k.id} className="flex justify-between gap-2"><span className={k.status === "DONE" ? "text-muted-foreground line-through" : ""}>{k.title}</span><span className="text-muted-foreground">{k.assigneeName ?? "unassigned"} · {titleCase(k.status)}</span></div>)}{t.tasks.length === 0 && <span className="text-muted-foreground">None.</span>}</CardContent></Card>
          </div>
          {t.summary && <Card size="sm"><CardHeader><CardTitle>The team&apos;s summary</CardTitle></CardHeader><CardContent className="whitespace-pre-wrap text-sm">{t.summary}</CardContent></Card>}
        </TabsContent>

        <TabsContent value="files" className="flex flex-col gap-2 text-sm">
          {t.files.map((f) => <div key={f.id} className="flex justify-between gap-2 rounded-md border p-2"><span>{f.url ? <a className="underline underline-offset-4" href={f.url} target="_blank" rel="noreferrer">{f.title}</a> : f.title} <Badge variant="outline">{titleCase(f.kind)}</Badge></span><span className="text-muted-foreground">{fmtDate(f.createdAt)}</span></div>)}
          {t.files.length === 0 && <p className="text-muted-foreground">No documents or presentations uploaded.</p>}
        </TabsContent>

        <TabsContent value="timeline" className="flex max-w-2xl flex-col gap-3">
          <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); void run("note", async () => { await api(`${base}/notes`, { method: "POST", body: { text: note } }); setNote("") }, "Feedback sent to the team") }}>
            <Textarea aria-label="Feedback for the team" placeholder="Feedback or a question for the team. The members are told." value={note} onChange={(e) => setNote(e.target.value)} /><div><Button type="submit" size="sm" disabled={busy === "note" || note.trim().length < 3}>{busy === "note" && <Spinner />}Send feedback</Button></div>
          </form>
          {t.updates.map((u) => <div key={u.id} className={`rounded-md border p-2 text-sm ${u.byStaff ? "bg-muted" : ""}`}><div className="text-xs text-muted-foreground">{u.author} · {fmtDateTime(u.createdAt)}</div><p className="whitespace-pre-wrap">{u.text}</p></div>)}
        </TabsContent>

        <TabsContent value="reviews" className="flex flex-col gap-4">
          {t.reviews.map((r) => (
            <Card key={r.id} size="sm"><CardHeader><CardTitle>{r.reviewerName} <Badge variant="outline">{titleCase(r.reviewerType)}</Badge> {r.isFinal ? <Badge>Final</Badge> : <Badge variant="secondary">Progress</Badge>}</CardTitle><CardDescription>{r.percent}% · {fmtDateTime(r.createdAt)}</CardDescription></CardHeader>
              <CardContent className="flex flex-col gap-1 text-sm">{CRITERIA.map((c) => <div key={c.key} className="flex justify-between"><span>{c.label}</span><span>{r.scores[c.key]}/10</span></div>)}{Object.entries(r.individualMarks).map(([id, m]) => <div key={id} className="flex justify-between text-muted-foreground"><span>Individual: {nameOf(id)}</span><span>{m}/10</span></div>)}{r.comments && <p className="mt-1 whitespace-pre-wrap">{r.comments}</p>}</CardContent></Card>
          ))}
          {t.status !== "FORMING" && !t.resultPublished && <ReviewForm base={base} team={t} onDone={reload} />}
        </TabsContent>

        <TabsContent value="result" className="flex max-w-2xl flex-col gap-4">
          {t.result ? <Alert><AlertTitle>{t.resultPublished ? `Published: team ${t.result.teamPercent}%` : `Preview: team ${t.result.teamPercent}% (not published)`}</AlertTitle>
            <AlertDescription><ul className="mt-1">{t.members.map((m) => <li key={m.studentId}>{m.name}: {t.result?.members?.[m.studentId] ?? "—"}%</li>)}</ul>Faculty and staff reviews count 60%, industry reviews 40% when both exist. Individual marks move one student&apos;s result without moving the team&apos;s.</AlertDescription></Alert> : <p className="text-sm text-muted-foreground">There is no final review yet, so there is no result.</p>}
          {!t.resultPublished && t.status === "SUBMITTED" && <div><Button disabled={busy === "pub" || !t.result} onClick={() => run("pub", () => api(`${base}/publish`, { method: "POST" }), "Result published and students told")}>{busy === "pub" && <Spinner />}Publish the result</Button></div>}
          {!t.resultPublished && t.status === "ACTIVE" && <p className="text-sm text-muted-foreground">The team has not submitted yet. A final review and the result come after it does.</p>}
          {!t.resultPublished && t.status !== "FORMING" && (
            <Card size="sm"><CardHeader><CardTitle>Ask an industry mentor to review</CardTitle><CardDescription>They get a link that works once, with no account needed. Send it only to them.</CardDescription></CardHeader>
              <CardContent className="flex flex-col gap-3">
                <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); void run("inv", async () => { const r = await api<{ link: string; emailed: boolean }>(`${base}/invites`, { method: "POST", body: invite }); setLink(r); setInvite({ name: "", email: "" }) }, "Invitation created") }}>
                  <Input aria-label="Mentor name" placeholder="Mentor's name" required value={invite.name} onChange={(e) => setInvite((o) => ({ ...o, name: e.target.value }))} /><Input aria-label="Mentor email" type="email" placeholder="Mentor's email" required value={invite.email} onChange={(e) => setInvite((o) => ({ ...o, email: e.target.value }))} />
                  <div><Button type="submit" size="sm" disabled={busy === "inv"}>{busy === "inv" && <Spinner />}Create invitation</Button></div>
                </form>
                {link && <Alert><AlertTitle>{link.emailed ? "Emailed to the mentor" : "Email is not set up: share this link yourself"}</AlertTitle><AlertDescription className="break-all">{link.link}</AlertDescription></Alert>}
                {t.invites.map((i) => <div key={i.id} className="flex justify-between text-sm"><span>{i.name} ({i.email})</span><span className="text-muted-foreground">{i.usedAt ? "reviewed" : new Date(i.expiresAt) < new Date() ? "expired" : `open until ${fmtDate(i.expiresAt)}`}</span></div>)}
              </CardContent></Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ReviewForm({ base, team, onDone }: { base: string; team: TeamView; onDone: () => void }) {
  const [scores, setScores] = React.useState<Record<string, string>>({})
  const [marks, setMarks] = React.useState<Record<string, string>>({})
  const [comments, setComments] = React.useState("")
  const [final, setFinal] = React.useState(team.status === "SUBMITTED")
  const [busy, setBusy] = React.useState(false)
  const ready = CRITERIA.every((c) => scores[c.key] !== undefined && scores[c.key] !== "")
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    try {
      await api(`${base}/reviews`, { method: "POST", body: { scores: Object.fromEntries(CRITERIA.map((c) => [c.key, Number(scores[c.key])])), comments: comments || undefined, individualMarks: Object.fromEntries(Object.entries(marks).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)])), isFinal: final } })
      toast.success(final ? "Final review saved" : "Review saved"); setScores({}); setMarks({}); setComments(""); onDone()
    } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  return (
    <Card><CardHeader><CardTitle>Add a review</CardTitle><CardDescription>Mark each point from 0 to 10. Individual marks are optional and let one student&apos;s result differ from the team&apos;s.</CardDescription></CardHeader>
      <CardContent>
        <form onSubmit={save} className="flex flex-col gap-4">
          <FieldGroup>
            {CRITERIA.map((c) => <Field key={c.key}><FieldLabel htmlFor={`s-${c.key}`}>{c.label} (0 to 10)</FieldLabel><Input id={`s-${c.key}`} className="w-24" type="number" min={0} max={10} step={1} required value={scores[c.key] ?? ""} onChange={(e) => setScores((o) => ({ ...o, [c.key]: e.target.value }))} /></Field>)}
            <Field><FieldLabel htmlFor="s-comments">Comments</FieldLabel><Textarea id="s-comments" value={comments} onChange={(e) => setComments(e.target.value)} /></Field>
            {team.members.length > 1 && <div className="flex flex-col gap-2"><span className="text-sm font-medium">Individual marks (optional, 0 to 10)</span>{team.members.map((m) => <div key={m.studentId} className="flex items-center gap-2 text-sm"><span className="w-48">{m.name}</span><Input aria-label={`Mark for ${m.name}`} className="w-24" type="number" min={0} max={10} step={1} value={marks[m.studentId] ?? ""} onChange={(e) => setMarks((o) => ({ ...o, [m.studentId]: e.target.value }))} /></div>)}</div>}
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={final} disabled={team.status !== "SUBMITTED"} onCheckedChange={(x) => setFinal(!!x)} />This is my final review (needs the team to have submitted)</label>
          </FieldGroup>
          <div><Button type="submit" disabled={busy || !ready}>{busy && <Spinner />}Save review</Button></div>
        </form>
      </CardContent></Card>
  )
}
