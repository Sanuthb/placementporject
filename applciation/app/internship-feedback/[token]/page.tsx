"use client"

import * as React from "react"
import { useParams } from "next/navigation"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { fmtDate, titleCase } from "@/lib/web/format"

type D = { mentor: string; student: string; role: string; company: string | null; startDate: string; endDate: string; approvedHours: number; attendancePercent: number | null; tasks: { title: string; status: string; isFinalReport: boolean }[] }

function Feedback() {
  const { token } = useParams<{ token: string }>()
  const [d, setD] = React.useState<D | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [score, setScore] = React.useState("")
  const [remarks, setRemarks] = React.useState("")
  const [feedback, setFeedback] = React.useState("")
  const [ppo, setPpo] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [done, setDone] = React.useState(false)

  React.useEffect(() => {
    fetch(`/api/internship-feedback/${token}`).then(async (r) => { const j = await r.json(); if (!r.ok) setError(j?.error?.message ?? "This link is not valid any more"); else setD(j.data) }).catch(() => setError("Could not load this page. Try again."))
  }, [token])

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null)
    try {
      const r = await fetch(`/api/internship-feedback/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ score: Number(score), remarks: remarks || undefined, feedback: feedback || undefined, recommendPpo: ppo }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error?.message ?? "Could not save your evaluation")
      setDone(true)
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save your evaluation") } finally { setBusy(false) }
  }

  if (done) return <main className="mx-auto max-w-2xl p-6"><Alert><AlertTitle>Thank you</AlertTitle><AlertDescription>Your evaluation was saved. This link no longer works.</AlertDescription></Alert></main>
  if (error && !d) return <main className="mx-auto max-w-2xl p-6"><Alert variant="destructive"><AlertTitle>Cannot open this page</AlertTitle><AlertDescription>{error}</AlertDescription></Alert></main>
  if (!d) return <main className="mx-auto max-w-2xl p-6"><Skeleton className="h-64" /></main>
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <div><h1 className="text-2xl font-semibold">Evaluate {d.student}</h1><p className="text-sm text-muted-foreground">Hello {d.mentor}. {d.student} interned as {d.role}{d.company ? ` at ${d.company}` : ""} from {fmtDate(d.startDate)} to {fmtDate(d.endDate)}.</p></div>
      <Card size="sm"><CardHeader><CardTitle>Recorded so far</CardTitle><CardDescription>{d.approvedHours} approved hours{d.attendancePercent !== null ? ` · attendance ${d.attendancePercent}%` : ""}</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">{d.tasks.map((t, i) => <div key={i} className="flex justify-between gap-2"><span>{t.title}{t.isFinalReport && " (final report)"}</span><Badge variant="outline">{titleCase(t.status)}</Badge></div>)}</CardContent></Card>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Card><CardHeader><CardTitle>Your evaluation</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Field><FieldLabel htmlFor="score">Overall score (0 to 100)</FieldLabel><Input id="score" className="w-28" type="number" min={0} max={100} step={1} required value={score} onChange={(e) => setScore(e.target.value)} /></Field>
            <Field><FieldLabel htmlFor="remarks">Remarks on performance</FieldLabel><Textarea id="remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>
            <Field><FieldLabel htmlFor="fb">Feedback for the student (what to keep doing, what to improve)</FieldLabel><Textarea id="fb" value={feedback} onChange={(e) => setFeedback(e.target.value)} /></Field>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={ppo} onCheckedChange={(x) => setPpo(!!x)} />I would recommend a pre-placement offer for this student</label>
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          </CardContent></Card>
        <div><Button type="submit" disabled={busy || score === ""}>{busy && <Spinner />}Submit evaluation</Button><p className="mt-2 text-xs text-muted-foreground">You can submit once. Your score and remarks are seen by the placement office; the feedback is shared with the student.</p></div>
      </form>
    </main>
  )
}

export default function InternshipFeedbackPage() {
  return (
    <React.Suspense fallback={<main className="mx-auto max-w-2xl p-6"><Skeleton className="h-64" /></main>}>
      <Feedback />
    </React.Suspense>
  )
}
