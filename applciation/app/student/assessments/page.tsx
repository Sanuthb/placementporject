"use client"

import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { fmtDateTime, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type A = { id: string; title: string; isBaseline: boolean; isPractice: boolean; startsAt: string; endsAt: string; durationMin: number; questions: number; state: string }

export default function StudentAssessmentsPage() {
  const { data } = useApi<A[]>("/api/student/assessments")
  if (!data) return <Skeleton className="h-48" />
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {data.map((a) => (
        <Card key={a.id}>
          <CardHeader><CardTitle>{a.title} {a.isBaseline && <Badge variant="secondary">Baseline</Badge>} {a.isPractice && <Badge variant="outline">Practice</Badge>}</CardTitle><CardDescription>{a.questions} questions · {a.durationMin} minutes · {fmtDateTime(a.startsAt)} to {fmtDateTime(a.endsAt)}</CardDescription></CardHeader>
          <CardContent className="flex items-center gap-2">
            <Badge variant={a.state === "OPEN" ? "default" : "outline"}>{titleCase(a.state)}</Badge>
            {(a.state === "OPEN" || a.state === "IN_PROGRESS") && <Button size="sm" className="ml-auto" render={<Link href={`/student/assessments/${a.id}`} />}>{a.state === "IN_PROGRESS" ? "Continue" : "Start"}</Button>}
            {["SUBMITTED", "AUTO_SUBMITTED", "FLAGGED"].includes(a.state) && <Button size="sm" variant="outline" className="ml-auto" render={<Link href={`/student/assessments/${a.id}`} />}>See result</Button>}
          </CardContent>
        </Card>
      ))}
      {data.length === 0 && <p className="text-sm text-muted-foreground">No assessments are scheduled for you.</p>}
    </div>
  )
}
