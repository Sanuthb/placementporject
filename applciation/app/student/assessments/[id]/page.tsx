"use client"

import * as React from "react"
import { useParams, useSearchParams } from "next/navigation"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { TestReport } from "@/components/test-report"
import type { QType } from "@/lib/mockTest"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { api, toastError } from "@/lib/web/api"
import { useApi } from "@/lib/web/use-api"

type Start = { attemptId: string; secondsLeft: number; instructions: string | null; questions: { id: string; type: QType; text: string; context?: string | null; language?: string | null; section?: string | null; options: string[]; marks: number }[]; savedAnswers: Record<string, number[] | string> | null }
type Result = { attemptNumber?: number; retakeInProgress?: boolean; cohort: { averagePercent: number; betterThanPercent: number } | null; title: string; score: number; maxScore: number; percent: number; passed: boolean | null; status: string }

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
        {!r.retakeInProgress && <TestReport id={id} />}
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
  const [answers, setAnswers] = React.useState<Record<string, number[] | string>>(exam.savedAnswers ?? {})
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

  function save(next: Record<string, number[] | string>, now = true) {
    setAnswers(next)
    if (now) void api(`/api/student/assessments/${id}/answers`, { method: "PUT", body: { answers: next } }).catch(() => {})
  }
  function pick(qid: string, index: number, on: boolean) {
    const cur = Array.isArray(answers[qid]) ? (answers[qid] as number[]) : []
    save({ ...answers, [qid]: on ? [...cur, index] : cur.filter((x) => x !== index) })
  }
  const filled = (v: number[] | string | undefined) => (Array.isArray(v) ? v.length > 0 : !!v?.trim())
  const mm = String(Math.floor(left / 60)).padStart(2, "0"), ss = String(left % 60).padStart(2, "0")
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="sticky top-0 z-10 flex items-center justify-between rounded-md border bg-background p-3"><span className="text-sm">{Object.keys(answers).filter((k) => filled(answers[k])).length} of {exam.questions.length} answered</span><Badge variant={left < 60 ? "destructive" : "secondary"}>{mm}:{ss} left</Badge></div>
      {exam.instructions && <Alert><AlertTitle>Instructions</AlertTitle><AlertDescription>{exam.instructions}</AlertDescription></Alert>}
      {exam.questions.map((q, i) => (
        <Card key={q.id}>
          <CardHeader><CardTitle className="text-base">{i + 1}. {q.text}</CardTitle><CardDescription>{q.marks} mark{q.marks > 1 ? "s" : ""}{q.type === "MULTIPLE" ? " · choose all that apply" : ""}{q.type === "FILL_BLANK" ? " · type the missing word or value" : ""}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {q.context && <p className="whitespace-pre-wrap rounded bg-muted p-3 text-sm">{q.context}</p>}
            {(q.type === "SINGLE" || q.type === "TRUE_FALSE") && (
              <RadioGroup value={Array.isArray(answers[q.id]) && (answers[q.id] as number[]).length ? String((answers[q.id] as number[])[0]) : ""} onValueChange={(v) => save({ ...answers, [q.id]: [Number(v)] })}>
                {q.options.map((o, j) => <label key={j} className="flex items-center gap-2 text-sm"><RadioGroupItem value={String(j)} />{o}</label>)}
              </RadioGroup>
            )}
            {q.type === "MULTIPLE" && q.options.map((o, j) => <label key={j} className="flex items-center gap-2 text-sm"><Checkbox checked={Array.isArray(answers[q.id]) && (answers[q.id] as number[]).includes(j)} onCheckedChange={(on) => pick(q.id, j, !!on)} />{o}</label>)}
            {q.type === "FILL_BLANK" && <Input aria-label="Your answer" value={typeof answers[q.id] === "string" ? (answers[q.id] as string) : ""} onChange={(e) => save({ ...answers, [q.id]: e.target.value }, false)} onBlur={() => save(answers)} />}
            {(q.type === "DESCRIPTIVE" || q.type === "CODING" || q.type === "SQL") && (
              <>
                <Textarea aria-label="Your answer" className={q.type === "DESCRIPTIVE" ? "min-h-32" : "min-h-48 font-mono text-xs"} placeholder={q.type === "DESCRIPTIVE" ? "Write your answer" : `Write your ${q.language ?? (q.type === "SQL" ? "SQL" : "code")} here`} value={typeof answers[q.id] === "string" ? (answers[q.id] as string) : ""} onChange={(e) => save({ ...answers, [q.id]: e.target.value }, false)} onBlur={() => save(answers)} />
                <p className="text-xs text-muted-foreground">Marked by AI against the model answer, then checked by staff if needed. Code is read, not run.</p>
              </>
            )}
          </CardContent>
        </Card>
      ))}
      <div><Button disabled={busy} onClick={() => void submit()}>{busy && <Spinner />}Submit assessment</Button></div>
    </div>
  )
}
