"use client"

import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/lib/web/auth"
import { fmtDateTime, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Drive = { id: string; role: string; driveDate: string; applicationDeadline: string; company: { name: string }; myApplication: string | null }
type App = { id: string; drive: { company: { name: string } }; journey: { round: number; type: string; scheduledAt: string | null; venue: string | null; slot: { startsAt: string; endsAt?: string } | null }[] }
type Assess = { id: string; title: string; startsAt: string; endsAt: string; state: string }
type Ev = { id: string; title: string; startsAt: string; endsAt: string; venue: string | null }
type Item = { key: string; title: string; kind: string; at: Date; end?: Date; place?: string }

const day = (d: Date) => d.toDateString()
const ics = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")

/** A .ics file the phone's calendar app can open. */
function downloadIcs(items: Item[]) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Placement//EN"]
  for (const i of items) lines.push("BEGIN:VEVENT", `UID:${i.key}@placement`, `DTSTAMP:${ics(new Date())}`, `DTSTART:${ics(i.at)}`, `DTEND:${ics(i.end ?? new Date(i.at.getTime() + 3_600_000))}`, `SUMMARY:${i.title.replace(/[,;\n]/g, " ")}`, ...(i.place ? [`LOCATION:${i.place.replace(/[,;\n]/g, " ")}`] : []), "END:VEVENT")
  lines.push("END:VCALENDAR")
  const url = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/calendar" }))
  const a = document.createElement("a"); a.href = url; a.download = "placement.ics"; a.click(); URL.revokeObjectURL(url)
}

export default function CalendarPage() {
  const { state } = useAuth()
  const mods = state.status === "ready" ? state.profile.modules : []
  const drives = useApi<Drive[]>(mods.includes("DRIVES") ? "/api/student/drives" : null)
  const apps = useApi<App[]>(mods.includes("DRIVES") ? "/api/student/applications" : null)
  const tests = useApi<Assess[]>(mods.includes("ASSESSMENTS") ? "/api/student/assessments" : null)
  const events = useApi<Ev[]>(mods.includes("EVENTS") ? "/api/student/events" : null)
  const [now] = React.useState(() => Date.now())
  const [picked, setPicked] = React.useState<Date | undefined>(new Date())

  const items = React.useMemo(() => {
    const out: Item[] = []
    for (const d of drives.data ?? []) {
      out.push({ key: `d${d.id}`, title: `${d.company.name} drive: ${d.role}`, kind: "Drive", at: new Date(d.driveDate) })
      if (!d.myApplication) out.push({ key: `dl${d.id}`, title: `Apply by: ${d.company.name} ${d.role}`, kind: "Deadline", at: new Date(d.applicationDeadline) })
    }
    for (const a of apps.data ?? []) for (const j of a.journey) {
      const at = j.slot?.startsAt ?? j.scheduledAt
      if (at) out.push({ key: `r${a.id}${j.round}`, title: `${a.drive.company.name}: ${titleCase(j.type)}`, kind: j.slot ? "Interview" : "Round", at: new Date(at), end: j.slot?.endsAt ? new Date(j.slot.endsAt) : undefined, place: j.venue ?? undefined })
    }
    for (const t of tests.data ?? []) out.push({ key: `t${t.id}`, title: `Test: ${t.title}`, kind: "Test", at: new Date(t.startsAt), end: new Date(t.endsAt) })
    for (const e of events.data ?? []) out.push({ key: `e${e.id}`, title: e.title, kind: "Event", at: new Date(e.startsAt), end: new Date(e.endsAt), place: e.venue ?? undefined })
    return out.sort((x, y) => +x.at - +y.at)
  }, [drives.data, apps.data, tests.data, events.data])

  const onDay = picked ? items.filter((i) => day(i.at) === day(picked)) : []
  const upcoming = items.filter((i) => i.at.getTime() >= now).slice(0, 8)
  return (
    <div className="grid max-w-5xl gap-4 md:grid-cols-[auto_1fr]">
      <Card className="w-fit">
        <CardContent>
          <Calendar mode="single" selected={picked} onSelect={setPicked} modifiers={{ busy: items.map((i) => i.at) }} modifiersClassNames={{ busy: "font-bold underline decoration-primary decoration-2 underline-offset-4" }} />
        </CardContent>
      </Card>
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader><CardTitle>{picked ? picked.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }) : "Pick a day"}</CardTitle><CardDescription>Days with something on are underlined</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {onDay.map((i) => <Row key={i.key} i={i} />)}
            {onDay.length === 0 && <span className="text-muted-foreground">Nothing on this day.</span>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Next up</CardTitle><CardDescription>Drives, rounds, interviews, tests, events and deadlines</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {upcoming.map((i) => <Row key={i.key} i={i} withDate />)}
            {upcoming.length === 0 && <span className="text-muted-foreground">Nothing coming up.</span>}
            {upcoming.length > 0 && <Button variant="outline" size="sm" className="self-start" onClick={() => downloadIcs(items.filter((i) => i.at.getTime() >= now))}>Add all to my phone calendar</Button>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Row({ i, withDate }: { i: Item; withDate?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline">{i.kind}</Badge>
      <span>{i.title}</span>
      <span className="text-muted-foreground">{withDate ? fmtDateTime(i.at) : i.at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}{i.place ? ` · ${i.place}` : ""}</span>
      <Button size="xs" variant="ghost" className="ml-auto" onClick={() => downloadIcs([i])}>Add to calendar</Button>
    </div>
  )
}
