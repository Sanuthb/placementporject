"use client"

import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { fmtDate, fmtDateTime, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Home = {
  readiness: { score: number; bandLabel: string; coverage: number; confidence: string; nextSteps: string[]; parts: { key: string; label: string; value: number | null }[] } | null
  today: { items: { title: string; kind: string; at: string; link: string | null }[]; overdue: { title: string; campaign: string; dueAt: string }[] }
  roadmap: { percent: number; done: number; total: number; next: { title: string; semester: number }[]; targetRole: string | null } | null
  learning: { courses: { id: string; title: string; percent: number; completed: boolean }[]; inProgress: number; completed: number; resourcesCompleted: number } | null
  skills: { value: number | null; note: string } | null
  tests: { latest: { id: string; title: string; percent: number; at: string }[]; average: number | null } | null
  interviews: { count: number; average: number | null; latest: { id: string; title: string; score: number | null }[] }
  discussions: { count: number; average: number | null; latest: { id: string; title: string; score: number | null }[] }
  campaigns: { id: string; title: string; done: number; total: number; percent: number; next: { title: string; dueAt: string } | null }[]
}

/** Readiness, today's tasks, roadmap, learning, skills, test results, interviews and campaigns, on the student's home page. */
export function StudentProgress() {
  const { data } = useApi<Home>("/api/student/home")
  if (!data) return <Skeleton className="h-64" />
  const r = data.readiness
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Today</CardTitle><CardDescription>Things dated today, and preparation that is late</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {data.today.items.map((t, i) => <div key={i} className="flex flex-wrap items-center gap-2"><Badge variant="outline">{titleCase(t.kind)}</Badge>{t.link ? <Link className="underline-offset-4 hover:underline" href={t.link}>{t.title}</Link> : t.title}</div>)}
          {data.today.overdue.map((t, i) => <div key={`o${i}`} className="flex flex-wrap items-center gap-2"><Badge variant="destructive">Late</Badge>{t.title}<span className="text-xs text-muted-foreground">{t.campaign}, was due {fmtDate(t.dueAt)}</span></div>)}
          {data.today.items.length === 0 && data.today.overdue.length === 0 && <span className="text-muted-foreground">Nothing is due today.</span>}
          <Button variant="outline" size="sm" className="self-start" render={<Link href="/student/calendar" />}>Open calendar</Button>
        </CardContent>
      </Card>
      {r && (
        <Card>
          <CardHeader><CardTitle>Career readiness {r.score}/100</CardTitle><CardDescription>{r.bandLabel}. Based on {r.coverage}% of the parts that can be measured. It does not predict selection.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <Progress value={r.score} />
            {r.nextSteps.map((s) => <span key={s} className="text-muted-foreground">{s}</span>)}
            <Button variant="outline" size="sm" className="self-start" render={<Link href="/student/prep" />}>See how it is worked out</Button>
          </CardContent>
        </Card>
      )}
      {data.roadmap && (
        <Card>
          <CardHeader><CardTitle>Career roadmap {data.roadmap.percent}%</CardTitle><CardDescription>{data.roadmap.done} of {data.roadmap.total} milestones done{data.roadmap.targetRole ? ` · aiming for ${data.roadmap.targetRole}` : ""}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <Progress value={data.roadmap.percent} />
            {data.roadmap.next.map((m) => <div key={m.title} className="flex justify-between gap-2"><span>{m.title}</span><span className="text-muted-foreground">Semester {m.semester}</span></div>)}
            <Button variant="outline" size="sm" className="self-start" render={<Link href="/student/roadmap" />}>Open roadmap</Button>
          </CardContent>
        </Card>
      )}
      {data.learning && (
        <Card>
          <CardHeader><CardTitle>Learning</CardTitle><CardDescription>{data.learning.inProgress} in progress, {data.learning.completed} completed, {data.learning.resourcesCompleted} study resources finished</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {data.learning.courses.map((c) => <div key={c.id} className="flex flex-col gap-1"><div className="flex justify-between gap-2"><span>{c.title}</span><span>{c.percent}%</span></div><Progress value={c.percent} /></div>)}
            {data.learning.courses.length === 0 && <span className="text-muted-foreground">You are not in a course yet.</span>}
            <Button variant="outline" size="sm" className="self-start" render={<Link href="/student/courses" />}>My courses</Button>
          </CardContent>
        </Card>
      )}
      {data.skills && (
        <Card>
          <CardHeader><CardTitle>Skill development</CardTitle><CardDescription>{data.skills.note}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm"><Progress value={(data.skills.value ?? 0) * 100} /><span className="text-xs text-muted-foreground">A skill counts when a staff check, project, course, internship or test backs it.</span></CardContent>
        </Card>
      )}
      {data.tests && (
        <Card>
          <CardHeader><CardTitle>Mock test performance</CardTitle><CardDescription>{data.tests.average === null ? "No scheduled test taken yet" : `Average of your last ${data.tests.latest.length}: ${data.tests.average}%`}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {data.tests.latest.map((t) => <div key={t.id + t.at} className="flex justify-between gap-2"><Link className="underline-offset-4 hover:underline" href={`/student/assessments/${t.id}`}>{t.title}</Link><span>{t.percent}% <span className="text-xs text-muted-foreground">{fmtDate(t.at)}</span></span></div>)}
            <Button variant="outline" size="sm" className="self-start" render={<Link href="/student/assessments" />}>All tests</Button>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>Mock interviews and discussions</CardTitle><CardDescription>{data.interviews.count} interviews{data.interviews.average !== null ? `, average ${data.interviews.average}/10` : ""} · {data.discussions.count} discussions{data.discussions.average !== null ? `, average ${data.discussions.average}/10` : ""}</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {data.interviews.latest.map((i) => <div key={i.id} className="flex justify-between gap-2"><span>Interview: {i.title}</span><span>{i.score ?? "-"}/10</span></div>)}
          {data.discussions.latest.map((d) => <div key={d.id} className="flex justify-between gap-2"><span className="truncate">Discussion: {d.title}</span><span>{d.score ?? "-"}/10</span></div>)}
          {data.interviews.count + data.discussions.count === 0 && <span className="text-muted-foreground">None finished yet.</span>}
          <Button variant="outline" size="sm" className="self-start" render={<Link href="/student/prep" />}>Practise</Button>
        </CardContent>
      </Card>
      {data.campaigns.length > 0 && (
        <Card className="md:col-span-2">
          <CardHeader><CardTitle>Preparation campaigns</CardTitle><CardDescription>Your plan for each job you are preparing for</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {data.campaigns.map((c) => <div key={c.id} className="flex flex-col gap-1"><div className="flex justify-between gap-2"><Link className="font-medium underline-offset-4 hover:underline" href="/student/campaigns">{c.title}</Link><span>{c.done} of {c.total} tasks</span></div><Progress value={c.percent} />{c.next && <span className="text-xs text-muted-foreground">Next: {c.next.title}, due {fmtDateTime(c.next.dueAt)}</span>}</div>)}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
