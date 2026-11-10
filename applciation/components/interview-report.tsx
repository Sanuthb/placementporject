"use client"

import { ReportButtons } from "@/components/report-buttons"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

export type Report = {
  summary: string; score: number; categories: { key: string; label: string; score: number; comment: string }[]; strengths: string[]; improvements: string[]; technicalFeedback: string
  perAnswer: { question: string; comment: string; suggested: string }[]; practice: string[]
}
type Comparison = { overallChange: number; improved: string[]; slipped: string[]; categories: { key: string; label: string; before: number; now: number; change: number }[]; previousDate?: string | null } | null

/** An interview report. Everything here is the AI's evaluation of what the student said; the student's own words are in the transcript above it, labelled separately. */
export function InterviewReport({ feedback, comparison, downloadPath }: { feedback: Report; comparison: Comparison; downloadPath?: string }) {
  return (
    <Card>
      <CardHeader><CardTitle>Report <Badge className="ml-2">{feedback.score}/10</Badge></CardTitle><CardDescription>Written by the AI from your answers. It is practice feedback, not a prediction of any selection result.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {downloadPath && <div><ReportButtons path={downloadPath} label="Download this report" /></div>}
        <p>{feedback.summary}</p>
        {comparison && <p className="text-muted-foreground">Compared with your previous interview of this kind: {comparison.overallChange >= 0 ? "+" : ""}{comparison.overallChange} overall.{comparison.improved.length > 0 && ` Better: ${comparison.improved.join(", ")}.`}{comparison.slipped.length > 0 && ` Lower: ${comparison.slipped.join(", ")}.`}</p>}
        {feedback.categories.length > 0 && <div className="flex flex-col gap-3"><div className="font-medium">Scores by area</div>{feedback.categories.map((c) => <div key={c.key} className="flex flex-col gap-1"><div className="flex justify-between"><span>{c.label}</span><span>{c.score}/10{comparison?.categories.find((x) => x.key === c.key) ? ` (before ${comparison.categories.find((x) => x.key === c.key)!.before})` : ""}</span></div><Progress value={c.score * 10} />{c.comment && <span className="text-xs text-muted-foreground">{c.comment}</span>}</div>)}</div>}
        <div><div className="font-medium">What went well</div><ul className="list-disc pl-5">{feedback.strengths.map((s) => <li key={s}>{s}</li>)}</ul></div>
        <div><div className="font-medium">What to improve</div><ul className="list-disc pl-5">{feedback.improvements.map((s) => <li key={s}>{s}</li>)}</ul></div>
        {feedback.technicalFeedback && <div><div className="font-medium">Technical feedback</div><p className="text-muted-foreground">{feedback.technicalFeedback}</p></div>}
        {feedback.perAnswer.map((p, i) => <div key={i} className="flex flex-col gap-1"><div className="font-medium">{p.question}</div><p className="text-muted-foreground">{p.comment}</p>{p.suggested && <p className="rounded bg-muted p-2"><span className="text-xs font-medium">A stronger answer (AI suggestion): </span>{p.suggested}</p>}</div>)}
        {feedback.practice.length > 0 && <div><div className="font-medium">Practise next</div><ul className="list-disc pl-5">{feedback.practice.map((s) => <li key={s}>{s}</li>)}</ul></div>}
      </CardContent>
    </Card>
  )
}
