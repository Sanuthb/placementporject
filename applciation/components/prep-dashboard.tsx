"use client"

import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { useApi } from "@/lib/web/use-api"

type Prep = {
  jobs: { approved: number; inReview: number; draft: number; shortlisted: number } | null
  campaigns: { active: number; draft: number; complete: number; students: number; accepted: number; ready: number; averageProgress: number | null; behind: number } | null
  tests: { attemptsLast90Days: number; students: number; averagePercent: number | null; passRate: number | null } | null
  interviews: { completedLast90Days: number; assigned: number; averageScore: number | null; assignments: number }
  discussions: { completedLast90Days: number; assigned: number; averageScore: number | null; assignments: number }
}
type Ready = { sampled: number; total: number; average: number | null; bands: { band: string; label: string; count: number }[]; weakestParts: { label: string; average: number }[] }

const Stat = ({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) => <div className="rounded-xl bg-muted/50 p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="text-lg font-semibold tabular-nums">{value}</div>{sub && <div className="text-xs text-muted-foreground">{sub}</div>}</div>

/** Preparation and readiness for the placement office: jobs, campaigns, mock results, interviews, discussions and the spread of career readiness. */
export function PrepDashboard({ withPrep = true }: { withPrep?: boolean }) {
  const prep = useApi<Prep>(withPrep ? "/api/dashboard/preparation" : null)
  // Readiness is worked out from many students at once, so it is loaded when asked for.
  const [show, setShow] = React.useState(false)
  const ready = useApi<Ready>(show ? "/api/dashboard/readiness" : null)
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:col-span-12">
      {withPrep && (!prep.data ? <Skeleton className="h-48" /> : (
        <>
          {prep.data.jobs && <Card><CardHeader><CardTitle>Jobs and matching</CardTitle><CardDescription>Job descriptions and candidates shortlisted from them</CardDescription></CardHeader><CardContent className="grid grid-cols-2 gap-3 text-sm"><Stat label="Approved jobs" value={prep.data.jobs.approved} /><Stat label="In review" value={prep.data.jobs.inReview} sub={`${prep.data.jobs.draft} drafts`} /><Stat label="Shortlisted candidates" value={prep.data.jobs.shortlisted} /></CardContent></Card>}
          {prep.data.campaigns && <Card><CardHeader><CardTitle>Preparation campaigns</CardTitle><CardDescription>{prep.data.campaigns.active} active · {prep.data.campaigns.complete} complete</CardDescription></CardHeader><CardContent className="grid grid-cols-2 gap-3 text-sm"><Stat label="Students preparing" value={prep.data.campaigns.students} sub={`${prep.data.campaigns.accepted} accepted`} /><Stat label="Average progress" value={prep.data.campaigns.averageProgress === null ? "-" : `${prep.data.campaigns.averageProgress}%`} /><Stat label="Falling behind" value={prep.data.campaigns.behind} /><Stat label="Ready for the final interview" value={prep.data.campaigns.ready} /></CardContent></Card>}
          {prep.data.tests && <Card><CardHeader><CardTitle>Mock tests (last 90 days)</CardTitle><CardDescription>Scheduled tests only</CardDescription></CardHeader><CardContent className="grid grid-cols-2 gap-3 text-sm"><Stat label="Attempts" value={prep.data.tests.attemptsLast90Days} sub={`${prep.data.tests.students} students`} /><Stat label="Average result" value={prep.data.tests.averagePercent === null ? "-" : `${prep.data.tests.averagePercent}%`} /><Stat label="Pass rate" value={prep.data.tests.passRate === null ? "-" : `${prep.data.tests.passRate}%`} sub="where a pass mark is set" /></CardContent></Card>}
          <Card><CardHeader><CardTitle>Interviews and discussions (last 90 days)</CardTitle><CardDescription>Students&apos; own practice counts in the totals but is never shown individually</CardDescription></CardHeader><CardContent className="grid grid-cols-2 gap-3 text-sm"><Stat label="Mock interviews" value={prep.data.interviews.completedLast90Days} sub={prep.data.interviews.averageScore === null ? undefined : `average ${prep.data.interviews.averageScore}/10`} /><Stat label="Discussions" value={prep.data.discussions.completedLast90Days} sub={prep.data.discussions.averageScore === null ? undefined : `average ${prep.data.discussions.averageScore}/10`} /><Stat label="Set up by you" value={prep.data.interviews.assignments + prep.data.discussions.assignments} sub={`${prep.data.interviews.assigned + prep.data.discussions.assigned} finished from them`} /></CardContent></Card>
        </>
      ))}
      {!show ? <Card><CardHeader><CardTitle>Career readiness</CardTitle><CardDescription>How developed students are overall, from a sample of up to 300 students. For coaching, not screening.</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => setShow(true)}>Show readiness</Button></CardContent></Card> : !ready.data ? <Skeleton className="h-48" /> : ((r) => (
        <Card>
          <CardHeader><CardTitle>Career readiness</CardTitle><CardDescription>{r.average === null ? "No data yet" : `Average ${r.average}/100`} · from {r.sampled} of {r.total} students. For coaching, not screening.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {r.bands.map((b) => <div key={b.band} className="flex items-center gap-3"><span className="w-28">{b.label}</span><Progress value={r.sampled ? (b.count / r.sampled) * 100 : 0} className="flex-1" /><span className="w-10 text-right tabular-nums">{b.count}</span></div>)}
            {r.weakestParts.length > 0 && <div className="flex flex-wrap items-center gap-2 pt-1"><span className="text-muted-foreground">Weakest parts:</span>{r.weakestParts.map((p) => <Badge key={p.label} variant="secondary">{p.label} {p.average}%</Badge>)}</div>}
          </CardContent>
        </Card>
      ))(ready.data)}
    </div>
  )
}
