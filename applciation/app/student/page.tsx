"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { StudentProgress } from "@/components/student-progress"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/lib/web/auth"
import { fmtDate, fmtDateTime, statusVariant, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"
import type { Completion } from "@/lib/profileCompletion"

type Me = { onboardingStatus?: string; name: string; enrollmentNo: string; department: { name: string }; batch: { name: string }; stage: string; participationStatus: string; isPlaced: boolean; modules: string[]; unreadNotifications: number }
type Blocks = { id: string; reason: string; endsAt: string }[]
type Sections = { stage: string; sections: { section: string; required: boolean; status: string; reviewComment: string | null }[] }
type Drive = { id: string; role: string; applicationDeadline: string; company: { name: string }; myApplication: string | null; eligibility: { eligible: boolean } }
type App = {
  id: string; status: string; drive: { id: string; role: string; company: { name: string } }
  journey: { round: number; type: string; scheduledAt: string | null; venue: string | null; result: string | null; slot: { startsAt: string } | null }[]
}
type Note = { id: string; title: string; body: string | null; readAt: string | null; createdAt: string }
type Ann = { id: string; title: string; body: string; publishedAt: string }
type Offer = { id: string; role: string; status: string; company: { name: string } }

const DAY = 86_400_000

export default function StudentHome() {
  const { state } = useAuth()
  const mods = state.status === "ready" ? state.profile.modules : []
  const has = (m: string) => mods.includes(m)
  const [now] = React.useState(() => Date.now())
  const me = useApi<Me>("/api/student/me")
  const router = useRouter()
  // A student who has accepted an invitation but not yet submitted goes straight to the onboarding wizard.
  React.useEffect(() => {
    if (me.data && ["INVITATION_ACCEPTED", "PROFILE_IN_PROGRESS", "CHANGES_REQUESTED"].includes(me.data.onboardingStatus ?? "")) router.replace("/student/onboarding")
  }, [me.data, router])
  const blocks = useApi<Blocks>(has("ATTENDANCE_BLOCKING") ? "/api/student/blocks" : null)
  const hist = useApi<{ warning: string | null }>(has("ATTENDANCE_BLOCKING") ? "/api/student/attendance/history" : null)
  const secs = useApi<Sections>(has("ONBOARDING") ? "/api/student/sections" : null)
  const comp = useApi<Completion>(has("ONBOARDING") ? "/api/student/completion" : null)
  const drives = useApi<Drive[]>(has("DRIVES") ? "/api/student/drives" : null)
  const apps = useApi<App[]>(has("DRIVES") ? "/api/student/applications" : null)
  const offers = useApi<Offer[]>(has("DRIVES") ? "/api/student/offers" : null)
  const notes = useApi<{ items: Note[] }>("/api/student/notifications")
  const anns = useApi<Ann[]>("/api/student/announcements")
  if (!me.data) return <Skeleton className="h-48" />
  const m = me.data

  const required = secs.data?.sections.filter((s) => s.required) ?? []
  const fix = required.filter((s) => s.status === "CHANGES_REQUESTED")

  const upcoming = (apps.data ?? []).flatMap((a) => a.journey.filter((j) => !j.result).map((j) => ({ a, j, at: j.slot?.startsAt ?? j.scheduledAt }))).filter((x) => x.at && new Date(x.at).getTime() >= now && new Date(x.at).getTime() <= now + 7 * DAY).sort((x, y) => +new Date(x.at!) - +new Date(y.at!))
  const openDrives = (drives.data ?? []).filter((d) => d.eligibility.eligible && !d.myApplication).sort((x, y) => +new Date(x.applicationDeadline) - +new Date(y.applicationDeadline)).slice(0, 5)
  const pendingOffers = (offers.data ?? []).filter((o) => o.status === "OFFERED")
  const unread = (notes.data?.items ?? []).filter((n) => !n.readAt).slice(0, 5)
  const live = (apps.data ?? []).filter((a) => !["REJECTED", "WITHDRAWN"].includes(a.status))
  const currentRound = (a: App) => { const j = a.journey.find((x) => !x.result || x.result === "ATTENDED"); return j ? `Round ${j.round}: ${titleCase(j.type)}` : "All rounds done" }

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      {blocks.data && blocks.data.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>You are blocked from applying to drives</AlertTitle>
          <AlertDescription>{blocks.data.map((b) => `${b.reason} (until ${fmtDate(b.endsAt)})`).join("; ")}. <Link href="/student/blocks" className="underline">See details and ask for a review</Link></AlertDescription>
        </Alert>
      )}
      {hist.data?.warning && <Alert variant="destructive"><AlertTitle>Attendance warning</AlertTitle><AlertDescription>{hist.data.warning} <Link href="/student/blocks" className="underline">See the rules</Link></AlertDescription></Alert>}
      {(fix.length > 0 || pendingOffers.length > 0) && (
        <Alert>
          <AlertTitle>Needs your action</AlertTitle>
          <AlertDescription className="flex flex-col gap-1">
            {fix.map((s) => <span key={s.section}><Link className="underline" href={`/student/profile/${s.section}`}>{titleCase(s.section)}</Link>: changes requested{s.reviewComment ? ` ("${s.reviewComment}")` : ""}</span>)}
            {pendingOffers.map((o) => <span key={o.id}><Link className="underline" href="/student/offers">{o.company.name} offer for {o.role}</Link> is waiting for your answer</span>)}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader><CardTitle className="text-xl">Hello, {m.name}</CardTitle><CardDescription>{m.enrollmentNo} · {m.department.name} · {m.batch.name}</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant={statusVariant(m.stage)}>{titleCase(m.stage)}</Badge>
          <Badge variant={statusVariant(m.participationStatus)}>{titleCase(m.participationStatus)}</Badge>
          {m.isPlaced && <Badge>Placed</Badge>}
        </CardContent>
      </Card>

      <StudentProgress />

      <div className="grid gap-4 md:grid-cols-2">
        {has("ONBOARDING") && (
          <Card>
            <CardHeader><CardTitle>Profile {comp.data ? `${comp.data.percent}% complete` : ""}</CardTitle><CardDescription>{comp.data ? `${comp.data.done} of ${comp.data.total} required items verified${comp.data.waiting ? `, ${comp.data.waiting} waiting for review` : ""}` : "Loading"}</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Progress value={comp.data?.percent ?? 0} />
              {comp.data && <div className="text-sm"><span className="font-medium">Next: {comp.data.nextAction.title}.</span> <span className="text-muted-foreground">{comp.data.nextAction.detail}</span></div>}
              {comp.data?.nextAction.href ? <Button className="self-start" render={<Link href={comp.data.nextAction.href} />}>{comp.data.nextAction.kind === "fix" ? "Fix it" : "Go"}</Button> : <Button variant="outline" className="self-start" render={<Link href="/student/profile" />}>Open profile</Button>}
            </CardContent>
          </Card>
        )}
        {has("DRIVES") && (
          <Card>
            <CardHeader><CardTitle>Coming up in 7 days</CardTitle><CardDescription>Rounds and interviews for drives you applied to</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {upcoming.map((x) => <div key={x.a.id + x.j.round} className="flex justify-between gap-2"><span>{x.a.drive.company.name}: {titleCase(x.j.type)}{x.j.venue ? ` at ${x.j.venue}` : ""}</span><span className="text-muted-foreground">{fmtDateTime(x.at)}</span></div>)}
              {upcoming.length === 0 && <span className="text-muted-foreground">Nothing scheduled this week.</span>}
            </CardContent>
          </Card>
        )}
        {has("DRIVES") && (
          <Card>
            <CardHeader><CardTitle>Open drives for you</CardTitle><CardDescription>You are eligible and have not applied</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {openDrives.map((d) => <div key={d.id} className="flex items-center justify-between gap-2"><Link className="underline-offset-4 hover:underline" href={`/student/drives/${d.id}`}>{d.company.name}: {d.role}</Link><span className="text-muted-foreground">by {fmtDate(d.applicationDeadline)}</span></div>)}
              {openDrives.length === 0 && <span className="text-muted-foreground">No open drives right now.</span>}
              <Button variant="outline" size="sm" className="self-start" render={<Link href="/student/drives" />}>All drives</Button>
            </CardContent>
          </Card>
        )}
        {has("DRIVES") && (
          <Card>
            <CardHeader><CardTitle>My applications</CardTitle><CardDescription>{live.length} in progress</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {live.slice(0, 5).map((a) => <div key={a.id} className="flex items-center justify-between gap-2"><span>{a.drive.company.name}: {a.drive.role}</span><Badge variant="outline">{currentRound(a)}</Badge></div>)}
              {live.length === 0 && <span className="text-muted-foreground">You have not applied to anything yet.</span>}
              <Button variant="outline" size="sm" className="self-start" render={<Link href="/student/applications" />}>Open applications</Button>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader><CardTitle>Announcements</CardTitle><CardDescription>From the placement office</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {anns.data?.slice(0, 3).map((a) => <div key={a.id}><div className="font-medium">{a.title}</div><div className="line-clamp-2 text-muted-foreground">{a.body}</div></div>)}
            {anns.data?.length === 0 && <span className="text-muted-foreground">No announcements.</span>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Notifications</CardTitle><CardDescription>{m.unreadNotifications} unread</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {unread.map((n) => <div key={n.id}><div className="font-medium">{n.title}</div>{n.body && <div className="line-clamp-1 text-muted-foreground">{n.body}</div>}</div>)}
            <Button variant="outline" size="sm" className="self-start" render={<Link href="/student/notifications" />}>Open</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
