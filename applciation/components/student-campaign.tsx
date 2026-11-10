"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { KIND_LABEL } from "@/lib/campaign"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, fmtDateTime, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Item = { id: string; day: number; dueAt: string; kind: string; title: string; detail: string | null; skill: string | null; refType: string | null; refId: string | null; optional: boolean; status: string; autoDone: boolean }
type Camp = {
  id: string; name: string; company: string; jobRole: string; description: string | null; startsAt: string; deadline: string; campaignStatus: string; trainers: string[]; group: string | null; status: string; declineReason: string | null
  job: { mandatory: { text: string }[]; preferred: { text: string }[]; location: string | null; salaryMinLpa: number | null; salaryMaxLpa: number | null; selectionProcess: string[]; experience: string | null } | null
  gapReport: { score: number; explanation: string[]; skills: { matched: string[]; partial: string[]; missing: string[] } } | null
  progress: { total: number; done: number; percent: number; overdue: number; behind: boolean }; items: Item[]
  mockTests: { title: string; date: string | null; window: { startsAt: string; endsAt: string } | null }[]; mockInterviews: { title: string; date: string | null; kind: string }[]; milestones: { title: string; dueAt: string }[]
  help: { note: string | null; at: string; response: string | null; respondedAt: string | null } | null
}
const MANUAL = ["LEARN", "PRACTICE", "REVISION"]
const link = (it: Item) => it.refType === "COURSE" && it.refId ? `/student/courses/${it.refId}` : it.kind === "RESOURCE" ? "/student/resources" : it.kind === "MOCK_TEST" ? "/student/assessments" : it.kind === "MOCK_INTERVIEW" ? "/student/prep" : null

/** My preparation campaign: the invitation, the job, my skill gap report, and my day-by-day plan. I see only my own plan. */
export function StudentCampaign({ id }: { id: string }) {
  const { data: c, reload } = useApi<Camp>(`/api/student/campaigns/${id}`)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [decline, setDecline] = React.useState<string | null>(null)
  const [help, setHelp] = React.useState<string | null>(null)
  if (!c) return <Skeleton className="h-96" />
  async function run(key: string, f: () => Promise<unknown>, ok?: string) { setBusy(key); try { await f(); if (ok) toast.success(ok); reload() } catch (e) { toastError(e) } finally { setBusy(null) } }
  const respond = (action: string, reason?: string) => run("respond", () => api(`/api/student/campaigns/${id}/respond`, { method: "POST", body: { action, reason } }), action === "ACCEPT" ? "You accepted. Your plan is below" : "You declined")
  const days = [...new Set(c.items.map((i) => i.day))]
  const active = c.campaignStatus === "ACTIVE"
  return (
    <div className="flex flex-col gap-4">
      <div><h1 className="text-xl font-semibold">{c.jobRole} at {c.company}</h1><p className="text-sm text-muted-foreground">{c.name} · {fmtDate(c.startsAt)} to {fmtDate(c.deadline)}{c.trainers.length ? ` · trainers: ${c.trainers.join(", ")}` : ""}{c.group ? ` · ${c.group}` : ""}</p></div>

      {c.status === "INVITED" && active && (
        <Alert><AlertTitle>You are invited to prepare for this job</AlertTitle><AlertDescription className="flex flex-col gap-2"><span>Accepting gives you a personal plan to follow until {fmtDate(c.deadline)}. It does not apply you to the job; you apply separately.</span><div className="flex gap-2"><Button disabled={!!busy} onClick={() => respond("ACCEPT")}>{busy === "respond" && <Spinner />}Accept</Button><Button variant="outline" disabled={!!busy} onClick={() => setDecline("")}>Decline</Button></div></AlertDescription></Alert>
      )}
      {c.status === "DECLINED" && active && <Alert><AlertTitle>You declined</AlertTitle><AlertDescription className="flex items-center gap-2">You can still change your mind. <Button size="sm" disabled={!!busy} onClick={() => respond("ACCEPT")}>Accept now</Button></AlertDescription></Alert>}
      {c.description && <p className="whitespace-pre-wrap text-sm">{c.description}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        {c.job && <Card size="sm"><CardHeader><CardTitle>The job</CardTitle><CardDescription>{[c.job.location, c.job.salaryMinLpa !== null ? `${c.job.salaryMinLpa}${c.job.salaryMaxLpa !== null ? ` to ${c.job.salaryMaxLpa}` : ""} LPA` : null, c.job.experience].filter(Boolean).join(" · ")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-2 text-sm">{c.job.mandatory.length > 0 && <div><span className="font-medium">Required: </span>{c.job.mandatory.map((r) => r.text).join("; ")}</div>}{c.job.preferred.length > 0 && <div className="text-muted-foreground"><span className="font-medium text-foreground">Preferred: </span>{c.job.preferred.map((r) => r.text).join("; ")}</div>}{c.job.selectionProcess.length > 0 && <div><span className="font-medium">Selection: </span>{c.job.selectionProcess.join(", ")}</div>}</CardContent></Card>}
        {c.gapReport && <Card size="sm"><CardHeader><CardTitle>Your skill gap report: {c.gapReport.score}% match when you were invited</CardTitle></CardHeader><CardContent className="flex flex-col gap-2 text-sm"><div className="flex flex-wrap gap-1">{c.gapReport.skills.matched.map((s) => <Badge key={s}>{s}</Badge>)}{c.gapReport.skills.partial.map((s) => <Badge key={s} variant="secondary">{s} (partly)</Badge>)}{c.gapReport.skills.missing.map((s) => <Badge key={s} variant="destructive">{s} (missing)</Badge>)}</div><ul className="list-disc pl-5 text-muted-foreground">{c.gapReport.explanation.slice(0, 4).map((e, i) => <li key={i}>{e}</li>)}</ul></CardContent></Card>}
      </div>

      {(c.mockTests.length > 0 || c.mockInterviews.length > 0 || c.milestones.length > 0) && (
        <Card size="sm"><CardHeader><CardTitle>Schedule</CardTitle></CardHeader><CardContent className="flex flex-col gap-1 text-sm">
          {c.mockTests.map((t, i) => <div key={i}>Mock test: {t.title}{t.window ? ` (open ${fmtDateTime(t.window.startsAt)} to ${fmtDateTime(t.window.endsAt)})` : t.date ? `, ${fmtDate(t.date)}` : ""}</div>)}
          {c.mockInterviews.map((t, i) => <div key={i}>Mock interview: {t.title}{t.date ? `, ${fmtDate(t.date)}` : ""}</div>)}
          {c.milestones.map((t, i) => <div key={i}>Milestone: {t.title}, {fmtDate(t.dueAt)}</div>)}</CardContent></Card>
      )}

      {c.status === "ACCEPTED" && (
        <>
          <div className="flex flex-wrap items-center gap-3"><div className="w-56"><Progress value={c.progress.percent} /></div><span className="text-sm text-muted-foreground">{c.progress.done} of {c.progress.total} done{c.progress.overdue ? `, ${c.progress.overdue} late` : ""}</span>{c.progress.behind && <Badge variant="destructive">You are falling behind</Badge>}</div>
          <div className="flex flex-col gap-3">
            {days.map((d) => (
              <div key={d} className="flex flex-col gap-1"><h3 className="text-sm font-medium">Day {d} <span className="font-normal text-muted-foreground">· {fmtDate(c.items.find((i) => i.day === d)?.dueAt)}</span></h3>
                {c.items.filter((i) => i.day === d).map((it) => (
                  <div key={it.id} className="flex flex-wrap items-start gap-2 rounded-md border p-2 text-sm">
                    {MANUAL.includes(it.kind) ? <Checkbox className="mt-0.5" aria-label={`Mark ${it.title} done`} checked={it.status === "DONE"} disabled={!active || !!busy} onCheckedChange={(v) => run(it.id, () => api(`/api/student/campaigns/${id}/plan/${it.id}`, { method: "POST", body: { done: !!v } }))} /> : <Badge variant={it.status === "DONE" ? "default" : "outline"} className="mt-0.5">{it.status === "DONE" ? "Done" : "To do"}</Badge>}
                    <div className="flex-1"><div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{KIND_LABEL[it.kind as keyof typeof KIND_LABEL] ?? it.kind}</Badge><span className={it.status === "DONE" ? "text-muted-foreground line-through" : "font-medium"}>{it.title}</span>{it.optional && <Badge variant="outline">Optional</Badge>}</div>{it.detail && <p className="text-xs text-muted-foreground">{it.detail}</p>}{!MANUAL.includes(it.kind) && it.status !== "DONE" && <p className="text-xs text-muted-foreground">Ticks itself when you finish it.</p>}</div>
                    {link(it) && it.status !== "DONE" && <Button size="sm" variant="outline" render={<Link href={link(it)!} />}>Open</Button>}
                  </div>
                ))}
              </div>
            ))}
            {days.length === 0 && <p className="text-sm text-muted-foreground">Your plan is empty.</p>}
          </div>
          <Card size="sm"><CardHeader><CardTitle>Need help?</CardTitle><CardDescription>Your trainers and the placement office are told.</CardDescription></CardHeader><CardContent className="flex flex-col gap-2 text-sm">
            {c.help && <div className="rounded-md border p-2"><p>You asked: &ldquo;{c.help.note}&rdquo; ({fmtDateTime(c.help.at)})</p>{c.help.response ? <p className="mt-1 rounded bg-muted p-2">Answer: {c.help.response}</p> : <p className="text-xs text-muted-foreground">Waiting for an answer</p>}</div>}
            {active && (!c.help || c.help.respondedAt) && <div><Button variant="outline" size="sm" onClick={() => setHelp("")}>Ask for support</Button></div>}
          </CardContent></Card>
        </>
      )}

      {decline !== null && <Dialog open onOpenChange={(o) => !o && setDecline(null)}><DialogContent><DialogHeader><DialogTitle>Decline this invitation?</DialogTitle></DialogHeader><Textarea aria-label="Reason" placeholder="Why? (optional, it helps your placement office)" value={decline} onChange={(e) => setDecline(e.target.value)} /><DialogFooter><Button variant="outline" onClick={() => { const r = decline; setDecline(null); void respond("DECLINE", r || undefined) }}>Decline</Button></DialogFooter></DialogContent></Dialog>}
      {help !== null && <Dialog open onOpenChange={(o) => !o && setHelp(null)}><DialogContent><DialogHeader><DialogTitle>Ask for support</DialogTitle></DialogHeader><Textarea aria-label="What do you need?" placeholder="What are you stuck on?" value={help} onChange={(e) => setHelp(e.target.value)} /><DialogFooter><Button disabled={help.trim().length < 5} onClick={() => { const n = help; setHelp(null); void run("help", () => api(`/api/student/campaigns/${id}/help`, { method: "POST", body: { note: n } }), "Your request was sent") }}>Send</Button></DialogFooter></DialogContent></Dialog>}
    </div>
  )
}
