"use client"

import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type A = { interested: boolean; id: string; title: string; companyName: string; jobType: string; location: string | null; description: string | null; applyUrl: string; deadline: string | null }

export default function JobAlertsPage() {
  const { data, reload } = useApi<A[]>("/api/student/job-alerts")
  const seen = React.useRef(new Set<string>())
  React.useEffect(() => { for (const a of data ?? []) if (!seen.current.has(a.id)) { seen.current.add(a.id); void api(`/api/student/job-alerts/${a.id}/event`, { method: "POST", body: { kind: "VIEW" } }).catch(() => {}) } }, [data])
  if (!data) return <Skeleton className="h-48" />
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {data.map((a) => (
        <Card key={a.id}>
          <CardHeader><CardTitle>{a.title}</CardTitle><CardDescription>{a.companyName} · {titleCase(a.jobType)}{a.location ? ` · ${a.location}` : ""}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {a.description && <p className="whitespace-pre-wrap text-muted-foreground">{a.description}</p>}
            <div className="flex items-center gap-2">{a.deadline && <Badge variant="outline">Apply by {fmtDate(a.deadline)}</Badge>}<Button size="sm" variant={a.interested ? "secondary" : "outline"} className="ml-auto" disabled={a.interested} onClick={async () => { try { await api(`/api/student/job-alerts/${a.id}/event`, { method: "POST", body: { kind: "INTERESTED" } }); reload() } catch (e) { toastError(e) } }}>{a.interested ? "Marked interested" : "I am interested"}</Button><Button size="sm" render={<a href={a.applyUrl} target="_blank" rel="noreferrer" onClick={() => { void api(`/api/student/job-alerts/${a.id}/event`, { method: "POST", body: { kind: "CLICK" } }).catch(() => {}) }} />}>Apply on their site</Button></div>
          </CardContent>
        </Card>
      ))}
      {data.length === 0 && <p className="text-sm text-muted-foreground">No openings shared right now.</p>}
    </div>
  )
}
