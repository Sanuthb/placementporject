"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { download, toastError } from "@/lib/web/api"
import { useApi } from "@/lib/web/use-api"

type R = { score: number; ready: boolean; checks: { key: string; label: string; ok: boolean }[]; improvements: string[]; keywords: string[] }

export default function ResumePage() {
  const { data } = useApi<R>("/api/student/resume")
  if (!data) return <Skeleton className="h-64" />
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card>
        <CardHeader><CardTitle>Resume readiness: {data.score}%</CardTitle><CardDescription>{data.ready ? "Your resume is ready to share." : "A few things would make it stronger."}</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Progress value={data.score} />
          <div><Button onClick={() => download("/api/student/resume.pdf").catch(toastError)}>Download resume (PDF)</Button></div>
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardHeader><CardTitle>Checklist</CardTitle></CardHeader><CardContent className="flex flex-col gap-2 text-sm">{data.checks.map((c) => <div key={c.key} className="flex items-center justify-between gap-2"><span>{c.label}</span><Badge variant={c.ok ? "default" : "secondary"}>{c.ok ? "Done" : "To do"}</Badge></div>)}</CardContent></Card>
        <Card><CardHeader><CardTitle>How to improve</CardTitle></CardHeader><CardContent className="flex flex-col gap-2 text-sm">{data.improvements.length ? <ul className="list-disc pl-5">{data.improvements.map((i) => <li key={i}>{i}</li>)}</ul> : <span className="text-muted-foreground">Nothing to add.</span>}{data.keywords.length > 0 && <div className="flex flex-wrap gap-1 pt-2">{data.keywords.map((k) => <Badge key={k} variant="outline">{k}</Badge>)}</div>}</CardContent></Card>
      </div>
    </div>
  )
}
