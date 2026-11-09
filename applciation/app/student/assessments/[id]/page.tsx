"use client"

import * as React from "react"
import { useParams, useSearchParams } from "next/navigation"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { api, toastError } from "@/lib/web/api"
import { useApi } from "@/lib/web/use-api"

type Start = { attemptId: string; secondsLeft: number; instructions: string | null; questions: { id: string; text: string; options: string[]; marks: number }[]; savedAnswers: Record<string, number[]> | null }
type Review = { id: string; text: string; options: string[]; correct: number[]; mine: number[]; explanation: string | null }
type Result = { attemptNumber?: number; retakeInProgress?: boolean; review: Review[] | null; cohort: { averagePercent: number; betterThanPercent: number } | null; title: string; score: number; maxScore: number; percent: number; passed: boolean | null; status: string }

export default function TakeAssessmentPage() {
  const { id } = useParams<{ id: string }>()
  const wantsRetake = useSearchParams().get("retake") === "1"
  const result = useApi<Result>(`/api/student/assessments/${id}/result`)
  const [exam, setExam] = React.useState<Start | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [started, setStarted] = React.useState(false)

  async function begin() {
    setBusy(true)
    try { setExam(await api<Start>(`/api/student/assessments/${id}/start`, { method: "POST" })); setStarted(true) } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  if (result.data && !started) {
    const r = result.data
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <Card>
          <CardHeader><CardTitle>{r.title}</CardTitle><CardDescription>Your result{r.attemptNumber && r.attemptNumber > 1 ? ` (attempt ${r.attemptNumber})` : ""}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="text-3xl font-semibold">{r.score} / {r.maxScore} ({r.percent}%)</div>
            {r.passed !== null && <Badge variant={r.passed ? "default" : "destructive"}>{r.passed ? "Passed" : "Not passed"}</Badge>}
            {r.cohort && <p className="text-sm text-muted-foreground">Your batch averaged {r.cohort.averagePercent}%. You scored higher than {r.cohort.betterThanPercent}% of them.</p>}
            {(r.retakeInProgress || wantsRetake) && (
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Button disabled={busy} onClick={begin}>{busy && <Spinner />}{r.retakeInProgress ? "Continue retake" : "Start retake"}</Button>
                <span className="text-xs text-muted-foreground">{r.retakeInProgress ? "Your retake is still running; its timer has not stopped." : "The timer starts when you press Start. This result is kept."}</span>
              </div>
            )}
          </CardContent>
        </Card>
        {r.review?.map((q, n) => {
          const right = q.mine.length === q.correct.length && q.mine.every((x) => q.correct.includes(x))
          return (
            <Card key={q.id} size="sm">
              <CardHeader><CardTitle className="text-sm">{n + 1}. {q.text}</CardTitle><CardDescription>{q.mine.length === 0 ? "Not answered" : right ? "Correct" : "Not correct"}</CardDescription></CardHeader>
              <CardContent className="flex flex-col gap-1 text-sm">
                {q.options.map((o, k) => <div key={k} className="flex items-center gap-2"><span>{o}</span>{q.correct.includes(k) && <Badge>Right answer</Badge>}{q.mine.includes(k) && <Badge variant="outline">Your answer</Badge>}</div>)}
                {q.explanation && <p className="pt-1 text-muted-foreground">{q.explanation}</p>}
              </CardContent>
            </Card>
          )
        })}
      </div>
    )
  }
  if (!exam) {
    if (result.loading && !result.error) return <Skeleton className="h-40" />
    return (
      <Card className="max-w-xl">
        <CardHeader><CardTitle>Ready to begin?</CardTitle><CardDescription>The timer starts when you press Start and cannot be paused. Switching tabs is recorded.</CardDescription></CardHeader>
        <CardContent><Button disabled={busy} onClick={begin}>{busy && <Spinner />}Start</Button></CardContent>
      </Card>
    )
  }
  return <Exam id={id} exam={exam} onDone={() => { setExam(null); setStarted(false); result.reload() }} />
}

function Exam({ id, exam, onDone }: { id: string; exam: Start; onDone: () => void }) {
  const [answers, setAnswers] = React.useState<Record<string, number[]>>(exam.savedAnswers ?? {})
  const [left, setLeft] = React.useState(exam.secondsLeft)
  const [busy, setBusy] = React.useState(false)
  const answersRef = React.useRef(answers)
  React.useEffect(() => { answersRef.current = answers }, [answers])
  const doneRef = React.useRef(false)

  const submit = React.useCallback(async () => {
    if (doneRef.current) return
    doneRef.current = true
    setBusy(true)
    try { await api(`/api/student/assessments/${id}/submit`, { method: "POST", body: { answers: answersRef.current } }); toast.success("Submitted"); onDone() } catch (e) { doneRef.current = false; toastError(e) } finally { setBusy(false) }
  }, [id, onDone])

  React.useEffect(() => {
    const t = setInterval(() => setLeft((s) => { if (s <= 1) { clearInterval(t); void submit(); return 0 } return s - 1 }), 1000)
    return () => clearInterval(t)
  }, [submit])
  React.useEffect(() => {
    const onHide = () => { if (document.hidden) void api(`/api/student/assessments/${id}/events`, { method: "POST", body: { type: "TAB_SWITCH" } }).catch(() => {}) }
    document.addEventListener("visibilitychange", onHide)
    return () => document.removeEventListener("visibilitychange", onHide)
  }, [id])

  function pick(qid: string, index: number, on: boolean) {
    const cur = answers[qid] ?? []
    const next = { ...answers, [qid]: on ? [...cur, index] : cur.filter((x) => x !== index) }
    setAnswers(next)
    void api(`/api/student/assessments/${id}/answers`, { method: "PUT", body: { answers: next } }).catch(() => {})
  }
  const mm = String(Math.floor(left / 60)).padStart(2, "0"), ss = String(left % 60).padStart(2, "0")
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="sticky top-0 z-10 flex items-center justify-between rounded-md border bg-background p-3"><span className="text-sm">{Object.keys(answers).filter((k) => answers[k].length).length} of {exam.questions.length} answered</span><Badge variant={left < 60 ? "destructive" : "secondary"}>{mm}:{ss} left</Badge></div>
      {exam.instructions && <Alert><AlertTitle>Instructions</AlertTitle><AlertDescription>{exam.instructions}</AlertDescription></Alert>}
      {exam.questions.map((q, i) => (
        <Card key={q.id}>
          <CardHeader><CardTitle className="text-base">{i + 1}. {q.text}</CardTitle><CardDescription>{q.marks} mark{q.marks > 1 ? "s" : ""}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {q.options.map((o, j) => <label key={j} className="flex items-center gap-2 text-sm"><Checkbox checked={(answers[q.id] ?? []).includes(j)} onCheckedChange={(on) => pick(q.id, j, !!on)} />{o}</label>)}
          </CardContent>
        </Card>
      ))}
      <div><Button disabled={busy} onClick={() => void submit()}>{busy && <Spinner />}Submit assessment</Button></div>
    </div>
  )
}
