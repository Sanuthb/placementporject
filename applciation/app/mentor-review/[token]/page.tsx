"use client"

import * as React from "react"
import { useParams } from "next/navigation"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { fmtDateTime } from "@/lib/web/format"

type D = {
  mentor: string; project: { title: string; problemStatement: string; skills: string[] }; team: string; status: string; summary: string | null; repoUrl: string | null; commits: number | null
  members: { id: string; name: string; role: string | null }[]; progress: { percent: number; milestonesDone: number; milestonesTotal: number; tasksDone: number; tasksTotal: number }; final: boolean
  updates: { text: string; createdAt: string }[]; files: { title: string; fileName: string; url: string | null }[]; criteria: { key: string; label: string }[]
}

/** Public page, no account: an invited industry mentor reads the team's work and gives one review. The link works once. */
export default function MentorReviewPage() {
  const { token } = useParams<{ token: string }>()
  const [d, setD] = React.useState<D | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [scores, setScores] = React.useState<Record<string, string>>({})
  const [marks, setMarks] = React.useState<Record<string, string>>({})
  const [comments, setComments] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [done, setDone] = React.useState(false)

  React.useEffect(() => {
    fetch(`/api/project-review/${token}`).then(async (r) => { const j = await r.json(); if (!r.ok) setError(j?.error?.message ?? "This review link is not valid any more"); else setD(j.data) }).catch(() => setError("Could not load the review. Try again."))
  }, [token])

  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (!d) return; setBusy(true)
    try {
      const r = await fetch(`/api/project-review/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scores: Object.fromEntries(d.criteria.map((c) => [c.key, Number(scores[c.key])])), comments: comments || undefined, individualMarks: Object.fromEntries(Object.entries(marks).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)])) }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error?.message ?? "Could not save your review")
      setDone(true)
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save your review") } finally { setBusy(false) }
  }

  if (done) return <main className="mx-auto flex max-w-2xl flex-col gap-3 p-6"><Alert><AlertTitle>Thank you</AlertTitle><AlertDescription>Your review was saved. This link no longer works.</AlertDescription></Alert></main>
  if (error && !d) return <main className="mx-auto flex max-w-2xl flex-col gap-3 p-6"><Alert variant="destructive"><AlertTitle>Cannot open this review</AlertTitle><AlertDescription>{error}</AlertDescription></Alert></main>
  if (!d) return <main className="mx-auto max-w-2xl p-6"><Skeleton className="h-64" /></main>
  const ready = d.criteria.every((c) => (scores[c.key] ?? "") !== "")
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <div><h1 className="text-2xl font-semibold">Review: {d.project.title}</h1><p className="text-sm text-muted-foreground">Hello {d.mentor}. You were asked to review the work of {d.team}. {d.final ? "The team has submitted its final work." : "The team is still working, so this will be a progress review."}</p></div>
      <Card size="sm"><CardHeader><CardTitle>The problem</CardTitle></CardHeader><CardContent className="flex flex-col gap-2 text-sm"><p className="whitespace-pre-wrap">{d.project.problemStatement}</p><div className="flex flex-wrap gap-1">{d.project.skills.map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}</div></CardContent></Card>
      <Card size="sm"><CardHeader><CardTitle>The team and its work</CardTitle><CardDescription>{d.members.map((m) => m.name + (m.role ? ` (${m.role})` : "")).join(", ")}</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex items-center gap-2"><Progress value={d.progress.percent} /><span className="text-xs text-muted-foreground">{d.progress.milestonesDone}/{d.progress.milestonesTotal} milestones, {d.progress.tasksDone}/{d.progress.tasksTotal} tasks</span></div>
          {d.summary && <p className="whitespace-pre-wrap">{d.summary}</p>}
          {d.repoUrl && <p><a className="underline underline-offset-4" href={d.repoUrl} target="_blank" rel="noreferrer">{d.repoUrl}</a>{d.commits !== null ? ` (${d.commits} commits)` : ""}</p>}
          {d.files.map((f) => <p key={f.fileName}>{f.url ? <a className="underline underline-offset-4" href={f.url} target="_blank" rel="noreferrer">{f.title}</a> : f.title}</p>)}
          {d.updates.map((u, i) => <p key={i} className="text-muted-foreground"><span className="text-xs">{fmtDateTime(u.createdAt)}</span> {u.text}</p>)}
        </CardContent></Card>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Card><CardHeader><CardTitle>Your review</CardTitle><CardDescription>Mark each point from 0 (poor) to 10 (excellent).</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3">
            {d.criteria.map((c) => <Field key={c.key}><FieldLabel htmlFor={`m-${c.key}`}>{c.label}</FieldLabel><Input id={`m-${c.key}`} className="w-24" type="number" min={0} max={10} step={1} required value={scores[c.key] ?? ""} onChange={(e) => setScores((o) => ({ ...o, [c.key]: e.target.value }))} /></Field>)}
            {d.members.length > 1 && <div className="flex flex-col gap-2"><span className="text-sm font-medium">Individual marks (optional, 0 to 10)</span>{d.members.map((m) => <div key={m.id} className="flex items-center gap-2 text-sm"><span className="w-48">{m.name}</span><Input aria-label={`Mark for ${m.name}`} className="w-24" type="number" min={0} max={10} step={1} value={marks[m.id] ?? ""} onChange={(e) => setMarks((o) => ({ ...o, [m.id]: e.target.value }))} /></div>)}</div>}
            <Field><FieldLabel htmlFor="m-comments">Comments for the team</FieldLabel><Textarea id="m-comments" value={comments} onChange={(e) => setComments(e.target.value)} /></Field>
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          </CardContent></Card>
        <div><Button type="submit" disabled={busy || !ready}>{busy && <Spinner />}Submit my review</Button><p className="mt-2 text-xs text-muted-foreground">You can submit once. The college shares your comments with the students after results are published.</p></div>
      </form>
    </main>
  )
}
