"use client"

import { PlacementJourney, type JourneyStatus } from "@/components/placement-journey"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { fmtDate, fmtDateTime, statusVariant, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type App = {
  id: string; status: string; appliedAt: string; drive: { id: string; role: string; driveDate: string; company: { name: string } }
  placement?: JourneyStatus | null
  journey: { at?: string | null; score?: number | string | null; remarks?: string | null; round: number; type: string; scheduledAt: string | null; venue: string | null; result: string | null; slot: { startsAt: string; panel: { name: string; room: string | null } | null } | null }[]
}

/** One sentence on where the student stands: which round they stopped at, or what comes next and where. */
function summary(a: App) {
  const stopped = a.journey.find((j) => j.result === "REJECTED")
  const next = a.journey.find((j) => !j.result)
  let text: string | null = null
  if (a.status === "WITHDRAWN") text = "You withdrew this application."
  else if (stopped || a.status === "REJECTED") text = stopped ? `You did not move past round ${stopped.round} (${titleCase(stopped.type)}).` : "This application was not taken forward."
  else if (next) text = `Next: round ${next.round}, ${titleCase(next.type)}${next.slot ? ` on ${fmtDateTime(next.slot.startsAt)}` : next.scheduledAt ? ` on ${fmtDateTime(next.scheduledAt)}` : ", date to be announced"}${next.venue ? ` at ${next.venue}` : ""}. Check your email and notifications for instructions.`
  else if (a.journey.length > 0) text = "You have been through every round. The placement office will share the final outcome."
  return text ? <p className="rounded-md bg-muted p-2">{text}</p> : null
}

export default function ApplicationsPage() {
  const { data } = useApi<App[]>("/api/student/applications")
  if (!data) return <Skeleton className="h-64" />
  if (data.length === 0) return <p className="text-sm text-muted-foreground">You have not applied to any drive yet. <Link href="/student/drives" className="underline">See open drives</Link>.</p>
  return (
    <div className="flex flex-col gap-4">
      {data.map((a) => (
        <Card key={a.id}>
          <CardHeader>
            <CardTitle><Link href={`/student/drives/${a.drive.id}`} className="hover:underline">{a.drive.company.name}: {a.drive.role}</Link></CardTitle>
            <CardDescription className="flex items-center gap-2">Applied {fmtDate(a.appliedAt)} · <Badge variant={statusVariant(a.status)}>{titleCase(a.status)}</Badge></CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {summary(a)}
            {a.placement && <details className="rounded-md border p-2"><summary className="cursor-pointer text-sm font-medium">Placement status: {a.placement.label}</summary><div className="pt-3"><PlacementJourney status={a.placement} /></div></details>}
            {a.journey.map((j) => (
              <div key={j.round} className="flex flex-wrap items-center justify-between gap-2">
                <span>Round {j.round}: {titleCase(j.type)}</span>
                <span className="text-muted-foreground">{j.slot ? `Interview ${fmtDateTime(j.slot.startsAt)}${j.slot.panel ? ` · ${j.slot.panel.name}${j.slot.panel.room ? `, ${j.slot.panel.room}` : ""}` : ""}` : fmtDateTime(j.scheduledAt)}</span>
                {j.result ? <Badge variant={statusVariant(j.result)}>{titleCase(j.result)}{j.at ? ` · ${fmtDate(j.at)}` : ""}</Badge> : <Badge variant="outline">Pending</Badge>}
                {(j.score !== null && j.score !== undefined || j.remarks) && <div className="w-full text-xs text-muted-foreground">{j.score !== null && j.score !== undefined ? `Score ${j.score}` : ""}{j.score !== null && j.score !== undefined && j.remarks ? ". " : ""}{j.remarks ?? ""}</div>}
              </div>
            ))}
            {a.journey.length === 0 && <span className="text-muted-foreground">No rounds announced yet.</span>}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
