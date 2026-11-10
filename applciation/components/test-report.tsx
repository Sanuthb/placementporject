"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { ReportButtons } from "@/components/report-buttons"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { QTYPE_LABEL, type QType } from "@/lib/mockTest"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, fmtDateTime } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Q = { id: string; type: QType; text: string; context: string | null; options: string[]; correct: number[]; acceptedAnswers: string[]; modelAnswer: string | null; mine: number[] | string | null; status: string; awarded: number; max: number; explanation: string | null; comment: string | null; markedBy: string | null; topics: string[] }
type Rep = {
  title: string; attemptNumber: number
  report: { score: number; max: number; percent: number; provisional: boolean; pending: number; passed: boolean | null; passPercent: number | null; failedSections: string[]; accuracy: { correct: number; wrong: number; partial: number; skipped: number; attempted: number } | null; time: { seconds: number | null; perQuestionSeconds: number | null }; sections: { key: string; label: string; score: number; max: number; percent: number; cutoff: number | null; passed: boolean | null }[]; topics: { topic: string; correct: number; total: number; percent: number }[]; weakTopics: { topic: string; percent: number }[]; questions: Q[] | null; answersAvailableAt: string | null }
  comparison: { overallChange: number; improved: string[]; slipped: string[] } | null
}
type Imp = { weakTopics: { topic: string; percent: number }[]; materials: { topic: string; resources: { id: string; title: string }[]; courses: { id: string; title: string }[] }[]; uncovered: string[]; exercises: { available: number; topics: string[] }; reassessAt: string; practiceScheduleId: string | null; nextTest: { id: string; title: string; startsAt: string } | null }

const mins = (s: number | null) => (s === null ? "-" : `${Math.floor(s / 60)} min ${s % 60} s`)
const STATUS: Record<string, string> = { CORRECT: "Correct", WRONG: "Not correct", PARTIAL: "Partly correct", SKIPPED: "Not answered", PENDING: "Waiting for a mark" }

/** My report on a finished test. Only what the test allows is shown; the server never sends the rest. */
export function TestReport({ id }: { id: string }) {
  const { data, error } = useApi<Rep>(`/api/student/assessments/${id}/report`)
  if (error) return <Alert variant="destructive"><AlertTitle>Could not load the report</AlertTitle><AlertDescription>{String((error as { message?: string }).message ?? error)}</AlertDescription></Alert>
  if (!data) return <Skeleton className="h-40" />
  const r = data.report
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader><CardTitle>{data.title}</CardTitle><CardDescription>Your result{data.attemptNumber > 1 ? ` (attempt ${data.attemptNumber})` : ""}</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="text-3xl font-semibold">{r.score} / {r.max} ({r.percent}%)</div>
          <div className="flex flex-wrap gap-2">
            {r.provisional && <Badge variant="secondary">Provisional</Badge>}
            {r.passed !== null && <Badge variant={r.passed ? "default" : "destructive"}>{r.passed ? "Passed" : "Not passed"}</Badge>}
            {r.passPercent !== null && <Badge variant="outline">Pass mark {r.passPercent}%</Badge>}
          </div>
          {r.provisional && <p className="text-sm text-muted-foreground">{r.pending} answer{r.pending > 1 ? "s are" : " is"} still being marked. This score will change and your pass result is decided once they are.</p>}
          {r.failedSections.length > 0 && <p className="text-sm text-destructive">Below the minimum in: {r.failedSections.join(", ")}</p>}
          <div className="flex flex-wrap gap-2 pt-1"><ReportButtons path={`/api/student/reports/test/${id}`} label="Download this report" /><ReportButtons path="/api/student/reports/performance" label="My performance report" /></div>
          {data.comparison && <p className="text-sm text-muted-foreground">Compared with your previous attempt: {data.comparison.overallChange >= 0 ? "+" : ""}{data.comparison.overallChange} points.{data.comparison.improved.length > 0 && ` Better in ${data.comparison.improved.join(", ")}.`}{data.comparison.slipped.length > 0 && ` Lower in ${data.comparison.slipped.join(", ")}.`}</p>}
        </CardContent>
      </Card>
      {r.accuracy && (
        <Card size="sm"><CardHeader><CardTitle className="text-sm">Accuracy and time</CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-5"><span>{r.accuracy.correct} correct</span><span>{r.accuracy.wrong} not correct</span><span>{r.accuracy.partial} partly</span><span>{r.accuracy.skipped} skipped</span><span>{mins(r.time.seconds)}{r.time.perQuestionSeconds !== null ? ` (${r.time.perQuestionSeconds} s each)` : ""}</span></CardContent></Card>
      )}
      {r.sections.length > 0 && (
        <Card size="sm"><CardHeader><CardTitle className="text-sm">Sections</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">{r.sections.map((s) => <div key={s.key} className="flex flex-col gap-1 text-sm"><div className="flex items-center justify-between"><span>{s.label}: {s.score} / {s.max}</span><span className="flex items-center gap-2">{s.percent}%{s.cutoff !== null && <Badge variant={s.passed ? "default" : "destructive"}>Minimum {s.cutoff}%</Badge>}</span></div><Progress value={s.percent} /></div>)}</CardContent></Card>
      )}
      {r.topics.length > 0 && (
        <Card size="sm"><CardHeader><CardTitle className="text-sm">Topics</CardTitle>{r.weakTopics.length > 0 && <CardDescription>To work on: {r.weakTopics.map((t) => t.topic).join(", ")}</CardDescription>}</CardHeader>
          <CardContent className="flex flex-col gap-3">{r.topics.map((t) => <div key={t.topic} className="flex flex-col gap-1 text-sm"><div className="flex justify-between"><span>{t.topic}</span><span>{t.correct} of {t.total} ({t.percent}%)</span></div><Progress value={t.percent} /></div>)}</CardContent></Card>
      )}
      {r.topics.length > 0 && !r.provisional && <Improvement id={id} />}
      {r.answersAvailableAt && <Alert><AlertTitle>Answers come later</AlertTitle><AlertDescription>The correct answers and explanations open on {fmtDateTime(r.answersAvailableAt)}.</AlertDescription></Alert>}
      {r.questions?.map((q, n) => <Answer key={q.id} q={q} n={n + 1} />)}
    </div>
  )
}

function Answer({ q, n }: { q: Q; n: number }) {
  const choice = q.type === "SINGLE" || q.type === "MULTIPLE" || q.type === "TRUE_FALSE"
  const mine = Array.isArray(q.mine) ? q.mine : []
  return (
    <Card size="sm">
      <CardHeader><CardTitle className="text-sm">{n}. {q.text}</CardTitle><CardDescription>{QTYPE_LABEL[q.type]} · {STATUS[q.status] ?? q.status} · {q.awarded} of {q.max}{q.markedBy ? ` · marked by ${q.markedBy === "AI" ? "AI" : "staff"}` : ""}</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {q.context && <p className="whitespace-pre-wrap rounded bg-muted p-2 text-xs">{q.context}</p>}
        {choice && q.options.map((o, k) => <div key={k} className="flex items-center gap-2"><span>{o}</span>{q.correct.includes(k) && <Badge>Right answer</Badge>}{mine.includes(k) && <Badge variant="outline">Your answer</Badge>}</div>)}
        {!choice && <><div><div className="text-xs font-medium">Your answer</div><pre className="whitespace-pre-wrap rounded border p-2 font-mono text-xs">{typeof q.mine === "string" && q.mine ? q.mine : "Not answered"}</pre></div>
          {q.type === "FILL_BLANK" && q.acceptedAnswers.length > 0 && <p>Accepted: {q.acceptedAnswers.join(", ")}</p>}
          {q.modelAnswer && <div><div className="text-xs font-medium">Model answer</div><pre className="whitespace-pre-wrap rounded border p-2 font-mono text-xs">{q.modelAnswer}</pre></div>}</>}
        {q.comment && <p className="text-muted-foreground">Feedback: {q.comment}</p>}
        {q.explanation && <p className="text-muted-foreground">{q.explanation}</p>}
      </CardContent>
    </Card>
  )
}

function Improvement({ id }: { id: string }) {
  const { data, error, reload } = useApi<Imp>(`/api/student/assessments/${id}/improvement`)
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  if (error || !data) return data === undefined && !error ? <Skeleton className="h-24" /> : null
  async function practice() {
    setBusy(true)
    try { const r = await api<{ scheduleId: string }>(`/api/student/assessments/${id}/improvement/practice`, { method: "POST" }); toast.success("Your practice set is ready"); reload(); router.push(`/student/assessments/${r.scheduleId}`) } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  return (
    <Card size="sm">
      <CardHeader><CardTitle className="text-sm">How to improve</CardTitle><CardDescription>Take this test again from {fmtDate(data.reassessAt)}.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {data.materials.map((m) => <div key={m.topic}><span className="font-medium">{m.topic}</span><ul className="list-disc pl-5">{m.resources.map((x) => <li key={x.id}><Link className="underline" href="/student/resources">{x.title}</Link></li>)}{m.courses.map((x) => <li key={x.id}><Link className="underline" href={`/student/courses/${x.id}`}>{x.title} (course)</Link></li>)}</ul></div>)}
        {data.uncovered.length > 0 && <p className="text-muted-foreground">No study material found yet for: {data.uncovered.join(", ")}.</p>}
        {data.exercises.available > 0 && <div className="flex flex-wrap items-center gap-2"><Button size="sm" disabled={busy} onClick={practice}>{busy && <Spinner />}{data.practiceScheduleId ? "Open my practice set" : "Make a practice set"}</Button><span className="text-xs text-muted-foreground">{data.exercises.available} questions on {data.exercises.topics.join(", ")}</span></div>}
        {data.nextTest && <p>Next test: <Link className="underline" href={`/student/assessments/${data.nextTest.id}`}>{data.nextTest.title}</Link> ({fmtDate(data.nextTest.startsAt)})</p>}
      </CardContent>
    </Card>
  )
}
