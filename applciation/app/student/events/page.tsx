"use client"

import Link from "next/link"
import { toast } from "sonner"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { api, toastError } from "@/lib/web/api"
import { fmtDateTime, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type E = { id: string; type: string; title: string; description: string | null; mode: string; venue: string | null; startsAt: string; endsAt: string; registrationDeadline: string | null; seatsLeft: number | null; myRegistration: string | null; joinUrl: string | null }

type Past = { id: string; type: string; title: string; startsAt: string; venue: string | null; status: string; rank: number | null; score: number | null; certificate: boolean }

export default function StudentEventsPage() {
  return (
    <Tabs defaultValue="upcoming">
      <TabsList><TabsTrigger value="upcoming">Upcoming</TabsTrigger><TabsTrigger value="results">My results</TabsTrigger></TabsList>
      <TabsContent value="upcoming"><Upcoming /></TabsContent>
      <TabsContent value="results"><Results /></TabsContent>
    </Tabs>
  )
}

function Results() {
  const { data } = useApi<Past[]>("/api/student/events", { scope: "past" })
  if (!data) return <Skeleton className="h-32" />
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {data.map((e) => (
        <Card key={e.id}>
          <CardHeader><CardTitle>{e.title}</CardTitle><CardDescription>{titleCase(e.type)} · {fmtDateTime(e.startsAt)}{e.venue ? ` · ${e.venue}` : ""}</CardDescription></CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={e.status === "ATTENDED" ? "default" : "outline"}>{e.status === "ATTENDED" ? "Attended" : "Not marked as attended"}</Badge>
            {e.rank !== null && <Badge variant="secondary">Rank {e.rank}</Badge>}
            {e.score !== null && <Badge variant="secondary">Score {e.score}</Badge>}
            {e.certificate && <Button size="sm" variant="outline" className="ml-auto" render={<Link href={`/student/events/${e.id}/certificate`} />}>Certificate</Button>}
          </CardContent>
        </Card>
      ))}
      {data.length === 0 && <p className="text-sm text-muted-foreground">Events you take part in will show here once they end.</p>}
    </div>
  )
}

function Upcoming() {
  const { data, reload } = useApi<E[]>("/api/student/events")
  if (!data) return <Skeleton className="h-48" />
  const act = (id: string, path: "register" | "cancel") => api(`/api/student/events/${id}/${path}`, { method: "POST" }).then(() => { toast.success(path === "register" ? "You are registered" : "Registration cancelled"); reload() }, toastError)
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {data.map((e) => (
        <Card key={e.id}>
          <CardHeader><CardTitle>{e.title}</CardTitle><CardDescription>{titleCase(e.type)} · {titleCase(e.mode)} · {fmtDateTime(e.startsAt)}{e.venue ? ` · ${e.venue}` : ""}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {e.description && <p className="whitespace-pre-wrap text-muted-foreground">{e.description}</p>}
            <div className="flex flex-wrap items-center gap-2">
              {e.myRegistration === "REGISTERED" ? <><Badge>Registered</Badge><Button size="sm" variant="outline" onClick={() => act(e.id, "cancel")}>Cancel</Button>{e.joinUrl && <Button size="sm" render={<a href={e.joinUrl} target="_blank" rel="noreferrer" />}>Join</Button>}</>
                : e.myRegistration ? <Badge variant="outline">{titleCase(e.myRegistration)}</Badge>
                : <Button size="sm" disabled={e.seatsLeft === 0} onClick={() => act(e.id, "register")}>{e.seatsLeft === 0 ? "Full" : "Register"}</Button>}
              {e.seatsLeft !== null && <span className="text-muted-foreground">{e.seatsLeft} seats left</span>}
            </div>
          </CardContent>
        </Card>
      ))}
      {data.length === 0 && <p className="text-sm text-muted-foreground">No events right now.</p>}
    </div>
  )
}
