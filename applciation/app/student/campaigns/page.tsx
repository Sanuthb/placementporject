"use client"

import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { fmtDate, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type C = { id: string; name: string; company: string; jobRole: string; campaignStatus: string; startsAt: string; deadline: string; status: string; progress: { percent: number; done: number; total: number; behind: boolean } }

/** Job-specific preparation campaigns I was invited to. */
export default function StudentCampaignsPage() {
  const { data } = useApi<C[]>("/api/student/campaigns")
  if (!data) return <Skeleton className="h-40" />
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {data.map((c) => (
        <Card key={c.id}>
          <CardHeader><CardTitle>{c.jobRole} at {c.company}</CardTitle><CardDescription>{c.name} · {fmtDate(c.startsAt)} to {fmtDate(c.deadline)}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2"><div className="flex gap-1"><Badge variant={c.status === "INVITED" ? "default" : "outline"}>{c.status === "INVITED" ? "Invitation waiting for you" : titleCase(c.status)}</Badge>{c.progress.behind && <Badge variant="destructive">Falling behind</Badge>}</div>{c.status === "ACCEPTED" && <div className="flex items-center gap-2"><Progress value={c.progress.percent} /><span className="text-xs text-muted-foreground">{c.progress.done}/{c.progress.total}</span></div>}</CardContent>
          <CardFooter><Button size="sm" render={<Link href={`/student/campaigns/${c.id}`} />}>{c.status === "INVITED" ? "See the invitation" : "Open my plan"}</Button></CardFooter>
        </Card>
      ))}
      {data.length === 0 && <p className="text-sm text-muted-foreground">You have not been invited to a preparation campaign. When your placement office wants to help you prepare for a job, it appears here.</p>}
    </div>
  )
}
