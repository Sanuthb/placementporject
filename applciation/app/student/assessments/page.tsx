"use client"

import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { fmtDateTime, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"
import { AssessmentHistory } from "@/components/assessment-history"

type A = { id: string; title: string; isBaseline: boolean; isPractice: boolean; startsAt: string; endsAt: string; durationMin: number; questions: number; state: string; attempts?: number; retake?: { allowed: boolean; reason: string | null } | null }

export default function StudentAssessmentsPage() {
  const { data } = useApi<A[]>("/api/student/assessments")
  if (!data) return <Skeleton className="h-48" />
  return (
    <div className="flex flex-col gap-6">
    <div className="grid gap-4 md:grid-cols-2">
      {data.map((a) => (
        <Card key={a.id}>
          <CardHeader><CardTitle>{a.title} {a.isBaseline && <Badge variant="secondary">Baseline</Badge>} {a.isPractice && <Badge variant="outline">Practice</Badge>}</CardTitle><CardDescription>{a.questions} questions · {a.durationMin} minutes · {fmtDateTime(a.startsAt)} to {fmtDateTime(a.endsAt)}</CardDescription></CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Badge variant={a.state === "OPEN" ? "default" : "outline"}>{titleCase(a.state)}</Badge>
            {(a.state === "OPEN" || a.state === "IN_PROGRESS") && <Button size="sm" className="ml-auto" render={<Link href={`/student/assessments/${a.id}`} />}>{a.state === "IN_PROGRESS" ? "Continue" : "Start"}</Button>}
            {(a.attempts ?? 0) > 1 && <span className="text-xs text-muted-foreground">{a.attempts} attempts</span>}
            {["SUBMITTED", "AUTO_SUBMITTED", "FLAGGED"].includes(a.state) && <Button size="sm" variant="outline" className="ml-auto" render={<Link href={`/student/assessments/${a.id}`} />}>See result</Button>}
            {a.retake?.allowed && <Button size="sm" render={<Link href={`/student/assessments/${a.id}?retake=1`} />}>Retake</Button>}
            {a.retake && !a.retake.allowed && a.retake.reason && <span className="w-full text-xs text-muted-foreground">{a.retake.reason}</span>}
          </CardContent>
        </Card>
      ))}
      {data.length === 0 && <p className="text-sm text-muted-foreground">No assessments are scheduled for you.</p>}
    </div>
    <AssessmentHistory endpoint="/api/student/assessments/history" />
    </div>
  )
}
