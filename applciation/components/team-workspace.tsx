"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
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
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, fmtDateTime, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

/** A student's team workspace: plan, updates, files, repository, team settings and (once published) the result. */
export function TeamWorkspace({ teamId }: { teamId: string }) {
  const base = `/api/student/project-teams/${teamId}`
  const { data: t, reload } = useApi<TeamView>(base)
  const [busy, setBusy] = React.useState<string | null>(null)
  if (!t) return <Skeleton className="h-64" />
  const me = t.members.find((m) => m.isMe)!
  const leader = me?.isLeader
  const open = t.status === "ACTIVE"
  async function run(key: string, f: () => Promise<unknown>, ok?: string) { setBusy(key); try { await f(); if (ok) toast.success(ok); reload() } catch (e) { toastError(e) } finally { setBusy(null) } }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex items-center gap-2"><h1 className="text-xl font-semibold">{t.project.title}</h1><Badge variant={STATUS[t.status]}>{titleCase(t.status)}</Badge></div><p className="text-sm text-muted-foreground">{t.name} · {t.members.map((m) => m.name).join(", ")}{t.project.dueAt ? ` · due ${fmtDate(t.project.dueAt)}` : ""}</p></div>
        <div className="flex items-center gap-3"><div className="w-40"><Progress value={t.progress.percent} /></div>
          {leader && t.status === "FORMING" && <Button disabled={busy === "start"} onClick={() => run("start", () => api(`${base}/start`, { method: "POST" }), "The team has started")}>{busy === "start" && <Spinner />}Start the team</Button>}
          {leader && open && <Button disabled={busy === "submit"} onClick={() => run("submit", () => api(`${base}/submit`, { method: "POST" }), "Submitted for review")}>{busy === "submit" && <Spinner />}Submit for review</Button>}
        </div>
      </div>
      {t.status === "FORMING" && <Alert><AlertTitle>The team has not started</AlertTitle><AlertDescription>It needs {t.project.type === "INDIVIDUAL" ? "one student" : `${t.project.minTeamSize} to ${t.project.maxTeamSize} members`}{t.project.type === "INTERDISCIPLINARY" ? " from at least two departments" : ""}. {leader ? "Press Start when it is ready." : "The leader starts it."} Others can join from the open projects list.</AlertDescription></Alert>}
      {(t.status === "SUBMITTED") && <Alert><AlertTitle>Submitted</AlertTitle><AlertDescription>Your work is with the reviewers. You can still post updates to answer their questions.</AlertDescription></Alert>}
      {t.result && t.resultPublished && <Alert><AlertTitle>Your result: {t.result.mine ?? t.result.teamPercent}%</AlertTitle><AlertDescription>The team scored {t.result.teamPercent}%. {t.result.mine !== null && t.result.mine !== t.result.teamPercent ? "Your own result reflects your individual marks." : ""}</AlertDescription></Alert>}

      <Tabs defaultValue="plan">
        <TabsList><TabsTrigger value="plan">Plan</TabsTrigger><TabsTrigger value="updates">Updates ({t.updates.length})</TabsTrigger><TabsTrigger value="files">Files ({t.files.length})</TabsTrigger><TabsTrigger value="repo">GitHub and contribution</TabsTrigger><TabsTrigger value="team">Team</TabsTrigger>{t.resultPublished && <TabsTrigger value="result">Result</TabsTrigger>}</TabsList>
        <TabsContent value="plan"><Plan base={base} t={t} open={open} leader={!!leader} reload={reload} /></TabsContent>
        <TabsContent value="updates"><Updates base={base} t={t} reload={reload} /></TabsContent>
        <TabsContent value="files"><Files base={base} t={t} reload={reload} /></TabsContent>
        <TabsContent value="repo"><Repo base={base} t={t} leader={!!leader} reload={reload} /></TabsContent>
        <TabsContent value="team"><Settings base={base} t={t} leader={!!leader} reload={reload} /></TabsContent>
        {t.resultPublished && <TabsContent value="result" className="flex max-w-2xl flex-col gap-3">{t.reviews.map((r) => <Card key={r.id} size="sm"><CardHeader><CardTitle>{r.reviewerName} <Badge variant="outline">{titleCase(r.reviewerType)}</Badge></CardTitle><CardDescription>{r.percent}%</CardDescription></CardHeader><CardContent className="flex flex-col gap-1 text-sm">{CRITERIA.map((c) => <div key={c.key} className="flex justify-between"><span>{c.label}</span><span>{r.scores[c.key]}/10</span></div>)}{r.comments && <p className="mt-1 whitespace-pre-wrap">{r.comments}</p>}</CardContent></Card>)}</TabsContent>}
      </Tabs>
    </div>
  )
}

type Ctx = { base: string; t: TeamView; reload: () => void }

function Plan({ base, t, open, leader, reload }: Ctx & { open: boolean; leader: boolean }) {
  const [title, setTitle] = React.useState("")
  const [assignee, setAssignee] = React.useState("")
  const [ms, setMs] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const call = async (f: () => Promise<unknown>) => { setBusy(true); try { await f(); reload() } catch (e) { toastError(e) } finally { setBusy(false) } }
  const people = [{ value: "", label: "Nobody yet" }, ...t.members.map((m) => ({ value: m.studentId, label: m.name }))]
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card size="sm"><CardHeader><CardTitle>Milestones</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {t.milestones.map((m) => <label key={m.id} className="flex items-center gap-2"><Checkbox checked={!!m.doneAt} disabled={!open || busy} onCheckedChange={(x) => call(() => api(`${base}/milestones/${m.id}`, { method: "PATCH", body: { done: !!x } }))} /><span className={m.doneAt ? "text-muted-foreground line-through" : ""}>{m.title}</span><span className={`ml-auto text-xs ${!m.doneAt && m.dueAt && new Date(m.dueAt) < new Date() ? "text-destructive" : "text-muted-foreground"}`}>{fmtDate(m.dueAt)}</span></label>)}
          {t.milestones.length === 0 && <span className="text-muted-foreground">No milestones yet.</span>}
          {leader && open && <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void call(async () => { await api(`${base}/milestones`, { method: "POST", body: { title: ms } }); setMs("") }) }}><Input aria-label="New milestone" placeholder="Add a milestone" value={ms} onChange={(e) => setMs(e.target.value)} /><Button type="submit" size="sm" variant="outline" disabled={busy || ms.trim().length < 2}>Add</Button></form>}
        </CardContent></Card>
      <Card size="sm"><CardHeader><CardTitle>Tasks</CardTitle><CardDescription>Finished tasks count as work by whoever they are assigned to.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {t.tasks.map((k) => (
            <div key={k.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
              <Checkbox checked={k.status === "DONE"} disabled={!open || busy} aria-label={`Mark ${k.title} done`} onCheckedChange={(x) => call(() => api(`${base}/tasks/${k.id}`, { method: "PATCH", body: { status: x ? "DONE" : "TODO" } }))} />
              <span className={k.status === "DONE" ? "text-muted-foreground line-through" : ""}>{k.title}</span>
              <span className="ml-auto text-xs text-muted-foreground">{k.assigneeName ?? "unassigned"}</span>
              {open && <OptionSelect className="w-36" value={k.assigneeId ?? ""} onChange={(v) => call(() => api(`${base}/tasks/${k.id}`, { method: "PATCH", body: { assigneeId: v || null } }))} options={people} placeholder="Assign" />}
              {open && <Button size="sm" variant="ghost" onClick={() => call(() => api(`${base}/tasks/${k.id}`, { method: "DELETE" }))}>Remove</Button>}
            </div>
          ))}
          {t.tasks.length === 0 && <span className="text-muted-foreground">No tasks yet.</span>}
          {open && <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); void call(async () => { await api(`${base}/tasks`, { method: "POST", body: { title, assigneeId: assignee || null } }); setTitle(""); setAssignee("") }) }}><Input aria-label="New task" placeholder="Add a task" value={title} onChange={(e) => setTitle(e.target.value)} /><div className="flex gap-2"><OptionSelect className="w-44" value={assignee} onChange={setAssignee} options={people} placeholder="Assign to" /><Button type="submit" size="sm" variant="outline" disabled={busy || title.trim().length < 3}>Add task</Button></div></form>}
        </CardContent></Card>
    </div>
  )
}

function Updates({ base, t, reload }: Ctx) {
  const [text, setText] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      {t.status !== "EVALUATED" && <form className="flex flex-col gap-2" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await api(`${base}/updates`, { method: "POST", body: { text } }); setText(""); toast.success("Update posted"); reload() } catch (err) { toastError(err) } finally { setBusy(false) } }}><Textarea aria-label="Progress update" placeholder="What did you do, what is next, what is blocking you?" value={text} onChange={(e) => setText(e.target.value)} /><div><Button type="submit" size="sm" disabled={busy || text.trim().length < 3}>{busy && <Spinner />}Post update</Button></div></form>}
      {t.updates.map((u) => <div key={u.id} className={`rounded-md border p-2 text-sm ${u.byStaff ? "bg-muted" : ""}`}><div className="text-xs text-muted-foreground">{u.author}{u.byStaff ? " (feedback)" : ""} · {fmtDateTime(u.createdAt)}</div><p className="whitespace-pre-wrap">{u.text}</p></div>)}
    </div>
  )
}

function Files({ base, t, reload }: Ctx) {
  const [file, setFile] = React.useState<File | null>(null)
  const [title, setTitle] = React.useState("")
  const [kind, setKind] = React.useState("DOCUMENT")
  const [busy, setBusy] = React.useState(false)
  const canEdit = t.status === "ACTIVE" || t.status === "SUBMITTED"
  async function upload(e: React.FormEvent) {
    e.preventDefault(); if (!file) return; setBusy(true)
    try { const fd = new FormData(); fd.set("file", file); fd.set("kind", kind); fd.set("title", title); await api(`${base}/files`, { method: "POST", body: fd }); toast.success("Uploaded"); setFile(null); setTitle(""); reload() } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  return (
    <div className="flex max-w-2xl flex-col gap-3 text-sm">
      {canEdit && <form onSubmit={upload} className="flex flex-col gap-2 rounded-md border p-3"><FieldGroup>
        <Field><FieldLabel>Kind</FieldLabel><OptionSelect className="w-full" value={kind} onChange={setKind} options={[{ value: "DOCUMENT", label: "Documentation" }, { value: "PRESENTATION", label: "Presentation" }]} placeholder="Kind" /></Field>
        <Field><FieldLabel htmlFor="f-title">Title</FieldLabel><Input id="f-title" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field><FieldLabel htmlFor="f-file">File (PDF, Word or PowerPoint, up to 20 MB)</FieldLabel><Input id="f-file" type="file" accept=".pdf,.docx,.pptx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
      </FieldGroup><div><Button type="submit" size="sm" disabled={busy || !file}>{busy && <Spinner />}Upload</Button></div></form>}
      {t.files.map((f) => <div key={f.id} className="flex items-center justify-between gap-2 rounded-md border p-2"><span>{f.url ? <a className="underline underline-offset-4" href={f.url} target="_blank" rel="noreferrer">{f.title}</a> : f.title} <Badge variant="outline">{titleCase(f.kind)}</Badge></span>{(t.status === "ACTIVE") && <Button size="sm" variant="ghost" onClick={() => api(`${base}/files/${f.id}`, { method: "DELETE" }).then(reload, toastError)}>Remove</Button>}</div>)}
      {t.files.length === 0 && <p className="text-muted-foreground">No files yet.</p>}
    </div>
  )
}

function Repo({ base, t, leader, reload }: Ctx & { leader: boolean }) {
  const [url, setUrl] = React.useState(t.repoUrl ?? "")
  const [gh, setGh] = React.useState(t.members.find((m) => m.isMe)?.githubUsername ?? "")
  const [busy, setBusy] = React.useState<string | null>(null)
  const run = async (k: string, f: () => Promise<unknown>, ok: string) => { setBusy(k); try { await f(); toast.success(ok); reload() } catch (e) { toastError(e) } finally { setBusy(null) } }
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {leader && t.status !== "EVALUATED" && <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void run("url", () => api(base, { method: "PATCH", body: { repoUrl: url.trim() || null } }), "Repository saved") }}><Input aria-label="GitHub repository link" type="url" placeholder="https://github.com/owner/name" value={url} onChange={(e) => setUrl(e.target.value)} /><Button type="submit" variant="outline" disabled={busy === "url"}>Save</Button></form>}
      {!leader && <p className="text-sm">{t.repoUrl ? <a className="underline underline-offset-4" href={t.repoUrl} target="_blank" rel="noreferrer">{t.repoUrl}</a> : "The leader has not added a repository link."}</p>}
      <form className="flex flex-col gap-1" onSubmit={(e) => { e.preventDefault(); void run("gh", () => api(`${base}/member`, { method: "PATCH", body: { githubUsername: gh.trim() || null } }), "Saved") }}>
        <label htmlFor="gh" className="text-sm font-medium">Your GitHub username (so your commits are counted as yours)</label>
        <div className="flex gap-2"><Input id="gh" value={gh} onChange={(e) => setGh(e.target.value)} /><Button type="submit" variant="outline" disabled={busy === "gh"}>Save</Button></div>
      </form>
      {t.repoUrl && <div><Button size="sm" variant="outline" disabled={busy === "sync"} onClick={() => run("sync", () => api(`${base}/sync`, { method: "POST" }), "Repository read")}>{busy === "sync" && <Spinner />}Read commits from GitHub</Button><p className="mt-1 text-xs text-muted-foreground">Only public repositories can be read, at most once every five minutes.</p></div>}
      {t.repoStats && <p className="text-sm">{t.repoStats.totalCommits} commits{t.repoStats.pushedAt ? `, last push ${fmtDate(t.repoStats.pushedAt)}` : ""}.</p>}
      <Card size="sm"><CardHeader><CardTitle>Who did what</CardTitle><CardDescription>Your reviewers see each member&apos;s recorded work next to the team&apos;s result: tasks finished, updates, files and commits.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">{t.contributions.map((c) => <div key={c.studentId} className="flex items-center gap-2"><span className="w-40 truncate">{c.name}</span><Progress value={c.sharePercent} /><span className="w-56 text-right text-xs text-muted-foreground">{c.tasksDone} tasks · {c.updates} updates · {c.files} files · {c.commits} commits</span></div>)}</CardContent></Card>
    </div>
  )
}

function Settings({ base, t, leader, reload }: Ctx & { leader: boolean }) {
  const router = useRouter()
  const me = t.members.find((m) => m.isMe)!
  const [name, setName] = React.useState(t.name)
  const [summary, setSummary] = React.useState(t.summary ?? "")
  const [role, setRole] = React.useState(me?.role ?? "")
  const [busy, setBusy] = React.useState<string | null>(null)
  const run = async (k: string, f: () => Promise<unknown>, ok: string) => { setBusy(k); try { await f(); toast.success(ok); reload() } catch (e) { toastError(e) } finally { setBusy(null) } }
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Card size="sm"><CardHeader><CardTitle>Members</CardTitle></CardHeader><CardContent className="flex flex-col gap-1 text-sm">{t.members.map((m) => <div key={m.studentId} className="flex justify-between"><span>{m.name} {m.isLeader && <Badge variant="secondary">Leader</Badge>}</span><span className="text-muted-foreground">{m.department}{m.role ? ` · ${m.role}` : ""}</span></div>)}</CardContent></Card>
      <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); void run("me", () => api(`${base}/member`, { method: "PATCH", body: { role: role.trim() || null } }), "Saved") }}>
        <label htmlFor="role" className="text-sm font-medium">Your role in this project (shown in your portfolio)</label>
        <div className="flex gap-2"><Input id="role" placeholder="for example Backend developer" value={role} onChange={(e) => setRole(e.target.value)} /><Button type="submit" variant="outline" disabled={busy === "me"}>Save</Button></div>
      </form>
      {leader && t.status !== "EVALUATED" && <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void run("team", () => api(base, { method: "PATCH", body: { name, summary: summary || null } }), "Saved") }}>
        <Field><FieldLabel htmlFor="tn">Team name</FieldLabel><Input id="tn" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field><FieldLabel htmlFor="ts">What the team built (shown in portfolios)</FieldLabel><Textarea id="ts" className="min-h-24" value={summary} onChange={(e) => setSummary(e.target.value)} /></Field>
        <div><Button type="submit" disabled={busy === "team"}>Save</Button></div></form>}
      <label className="flex items-center gap-2 text-sm"><Switch checked={me?.showInPortfolio ?? true} onCheckedChange={(x) => run("pf", () => api(`${base}/member`, { method: "PATCH", body: { showInPortfolio: x } }), x ? "Shown in your portfolio" : "Hidden from your portfolio")} />Show this project in my portfolio and shareable profile</label>
      {t.status === "FORMING" && <Button variant="outline" onClick={() => run("leave", async () => { await api(`${base}/leave`, { method: "POST" }); router.push("/student/projects") }, "You left the team")}>Leave the team</Button>}
    </div>
  )
}
