"use client"

import * as React from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { QTYPE_LABEL, type QType } from "@/lib/mockTest"
import { api, toastError } from "@/lib/web/api"
import { fmtDateTime } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type A = { questionId: string; type: QType; language: string | null; context: string | null; text: string; maxMarks: number; modelAnswer: string | null; rubric: string | null; answer: string; mark: { awarded: number; by: string; comment?: string } | null }
type Attempt = { id: string; student: { name: string; enrollmentNo: string }; schedule: { title: string }; submittedAt: string; attemptNumber: number; answers: A[] }

/** Descriptive, coding and SQL answers waiting for a mark. The AI has already suggested a mark where it could; correct it or confirm it. The student sees the final score once every answer is marked. */
export function AnswerMarking() {
  const { data, reload } = useApi<Attempt[]>("/api/assessments/marking")
  if (!data) return <Skeleton className="h-40" />
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Students see a provisional score until every open answer is marked. Code is read, not run.</p>
      {data.map((a) => <Item key={a.id} a={a} onDone={reload} />)}
      {data.length === 0 && <p className="text-sm text-muted-foreground">Nothing is waiting for marking.</p>}
    </div>
  )
}

function Item({ a, onDone }: { a: Attempt; onDone: () => void }) {
  const [m, setM] = React.useState<Record<string, { awarded: string; comment: string }>>(() => Object.fromEntries(a.answers.map((x) => [x.questionId, { awarded: x.mark ? String(x.mark.awarded) : "", comment: x.mark?.comment ?? "" }])))
  const [busy, setBusy] = React.useState(false)
  async function save() {
    setBusy(true)
    try {
      const marks = Object.fromEntries(Object.entries(m).filter(([, v]) => v.awarded !== "").map(([k, v]) => [k, { awarded: Number(v.awarded), ...(v.comment ? { comment: v.comment } : {}) }]))
      const r = await api<{ final: boolean; score: number; max: number }>(`/api/assessments/marking/${a.id}`, { method: "POST", body: { marks } })
      toast.success(r.final ? `Marked: ${r.score} of ${r.max}. The student was told` : "Saved. Some answers still need a mark"); onDone()
    } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  return (
    <Card size="sm"><CardHeader><CardTitle>{a.student.name} · {a.schedule.title}</CardTitle><CardDescription>{a.student.enrollmentNo} · attempt {a.attemptNumber} · submitted {fmtDateTime(a.submittedAt)}</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {a.answers.map((x) => (
          <div key={x.questionId} className="flex flex-col gap-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{QTYPE_LABEL[x.type]}{x.language ? ` (${x.language})` : ""}</Badge><span className="font-medium">{x.text}</span><span className="text-xs text-muted-foreground">out of {x.maxMarks}</span></div>
            {x.context && <p className="whitespace-pre-wrap rounded bg-muted p-2 text-xs">{x.context}</p>}
            <div><div className="text-xs font-medium">The student&apos;s answer</div><pre className="whitespace-pre-wrap rounded border p-2 font-mono text-xs">{x.answer}</pre></div>
            {(x.modelAnswer || x.rubric) && <Alert><AlertTitle>Model answer</AlertTitle><AlertDescription>{x.modelAnswer && <pre className="whitespace-pre-wrap font-mono text-xs">{x.modelAnswer}</pre>}{x.rubric && <p className="mt-1">Look for: {x.rubric}</p>}</AlertDescription></Alert>}
            {x.mark?.by === "AI" && <p className="text-xs text-muted-foreground">AI suggested {x.mark.awarded}{x.mark.comment ? `: ${x.mark.comment}` : ""}</p>}
            <div className="flex flex-wrap items-center gap-2"><Input aria-label="Marks" className="w-24" type="number" min={0} max={x.maxMarks} step="0.5" value={m[x.questionId].awarded} onChange={(e) => setM((o) => ({ ...o, [x.questionId]: { ...o[x.questionId], awarded: e.target.value } }))} /><Input aria-label="Comment for the student" className="min-w-48 flex-1" placeholder="Comment for the student (optional)" value={m[x.questionId].comment} onChange={(e) => setM((o) => ({ ...o, [x.questionId]: { ...o[x.questionId], comment: e.target.value } }))} /></div>
          </div>
        ))}
        <div><Button disabled={busy || a.answers.some((x) => m[x.questionId].awarded === "")} onClick={save}>{busy && <Spinner />}Save marks</Button></div>
      </CardContent></Card>
  )
}
