"use client"

import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { api, toastError } from "@/lib/web/api"
import { titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type P = { programmeId: string; title: string; goal: string; delivery: string; partnerName: string | null; percent: number; steps: { index: number; title: string; type: string; url?: string; hours?: number; completed: boolean }[] }

export default function StudentLearningPage() {
  const { data, reload } = useApi<P[]>("/api/student/learning")
  if (!data) return <Skeleton className="h-48" />
  const done = (p: P, i: number) => api(`/api/student/learning/${p.programmeId}/steps/${i}/complete`, { method: "POST" }).then(() => { toast.success("Step completed"); reload() }, toastError)
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {data.map((p) => (
        <Card key={p.programmeId}>
          <CardHeader><CardTitle>{p.title}</CardTitle><CardDescription>{p.goal} · {titleCase(p.delivery)}{p.partnerName ? ` with ${p.partnerName}` : ""}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <Progress value={p.percent} />
            {p.steps.map((s) => <label key={s.index} className="flex items-center gap-2"><Checkbox checked={s.completed} disabled={s.completed} onCheckedChange={() => done(p, s.index)} /><span className={s.completed ? "text-muted-foreground line-through" : ""}>{s.url ? <a className="underline underline-offset-4" href={s.url} target="_blank" rel="noreferrer">{s.title}</a> : s.title}</span><Badge variant="outline">{titleCase(s.type)}</Badge></label>)}
          </CardContent>
        </Card>
      ))}
      {data.length === 0 && <p className="text-sm text-muted-foreground">You are not in any learning programme yet.</p>}
    </div>
  )
}
