"use client"

import * as React from "react"
import { toast } from "sonner"

import { DiscussionPractice } from "@/components/discussion-practice"
import { MockInterviews } from "@/components/mock-interviews"
import { StudentReadiness } from "@/components/student-readiness"
import { OptionSelect } from "@/components/option-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { ROUND_TYPES } from "@/lib/web/enums"
import { fmtDateTime, statusVariant, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Exp = { id: string; companyName: string; role: string; roundType: string | null; experience: string; difficulty: number }
type Mine = { id: string; companyName: string; role: string; status: string; moderationNote: string | null }
type Slot = { id: string; startsAt: string; endsAt: string; counsellor: { name: string }; status?: string }

function Readiness() {
  const { data } = useApi<{ profile: { verified: number; required: number }; assessments: { taken: number; averagePercent: number | null } | null; drivesAttended: number | null; mockInterviews: { done: number; averageScore: number | null } }>("/api/student/readiness")
  if (!data) return <Skeleton className="h-24" />
  const item = (label: string, value: string, hint?: string) => <Card size="sm"><CardHeader><CardDescription>{label}</CardDescription><CardTitle className="text-xl">{value}</CardTitle></CardHeader>{hint && <CardContent className="text-xs text-muted-foreground">{hint}</CardContent>}</Card>
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {item("Profile", `${data.profile.verified} / ${data.profile.required}`, "required sections verified")}
      {data.assessments && item("Assessments", data.assessments.averagePercent === null ? "None yet" : `${data.assessments.averagePercent}%`, `${data.assessments.taken} taken`)}
      {data.drivesAttended !== null && item("Drives attended", String(data.drivesAttended))}
      {item("Mock interviews", data.mockInterviews.averageScore === null ? "None yet" : `${data.mockInterviews.averageScore}/10`, `${data.mockInterviews.done} finished`)}
    </div>
  )
}

export default function PrepPage() {
  return (
    <div className="flex flex-col gap-4">
      <Readiness />
      <PrepTabs />
    </div>
  )
}

function PrepTabs() {
  return (
    <Tabs defaultValue="readiness">
      <TabsList><TabsTrigger value="readiness">Readiness</TabsTrigger><TabsTrigger value="mock">Mock interviews</TabsTrigger><TabsTrigger value="discussion">Group discussion</TabsTrigger><TabsTrigger value="experiences">Interview experiences</TabsTrigger><TabsTrigger value="counselling">Counselling</TabsTrigger></TabsList>
      <TabsContent value="readiness"><StudentReadiness /></TabsContent>
      <TabsContent value="mock"><MockInterviews /></TabsContent>
      <TabsContent value="discussion"><DiscussionPractice /></TabsContent>
      <TabsContent value="experiences"><Experiences /></TabsContent>
      <TabsContent value="counselling"><Counselling /></TabsContent>
    </Tabs>
  )
}

function Experiences() {
  const [company, setCompany] = React.useState("")
  const all = useApi<Exp[]>("/api/student/prep/experiences", { company: React.useDeferredValue(company) })
  const mine = useApi<Mine[]>("/api/student/prep/experiences", { mine: true })
  const [round, setRound] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  async function share(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const form = e.currentTarget
    setBusy(true)
    try { await api("/api/student/prep/experiences", { method: "POST", body: { companyName: f.get("company"), role: f.get("role"), experience: f.get("experience"), difficulty: Number(f.get("difficulty")), ...(round ? { roundType: round } : {}) } }); toast.success("Thanks. It will appear once the placement cell has checked it."); form.reset(); mine.reload() } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <Input placeholder="Search by company" value={company} onChange={(e) => setCompany(e.target.value)} />
        {all.data?.map((x) => <Card key={x.id} size="sm"><CardHeader><CardTitle>{x.companyName}: {x.role}</CardTitle><CardDescription>{x.roundType ? `${titleCase(x.roundType)} · ` : ""}Difficulty {x.difficulty}/5</CardDescription></CardHeader><CardContent className="whitespace-pre-wrap text-sm">{x.experience}</CardContent></Card>)}
        {all.data?.length === 0 && <p className="text-sm text-muted-foreground">No experiences shared yet.</p>}
      </div>
      <div className="flex flex-col gap-3">
        <Card>
          <CardHeader><CardTitle>Share your experience</CardTitle><CardDescription>Help juniors prepare. At least 50 characters.</CardDescription></CardHeader>
          <CardContent>
            <form onSubmit={share}>
              <FieldGroup>
                <Field><FieldLabel htmlFor="company">Company</FieldLabel><Input id="company" name="company" required /></Field>
                <Field><FieldLabel htmlFor="role">Role</FieldLabel><Input id="role" name="role" required /></Field>
                <Field><FieldLabel>Round (optional)</FieldLabel><OptionSelect className="w-full" value={round} onChange={setRound} options={[{ value: "", label: "Not specific" }, ...ROUND_TYPES]} placeholder="Round" /></Field>
                <Field><FieldLabel htmlFor="difficulty">Difficulty (1 easy to 5 hard)</FieldLabel><Input id="difficulty" name="difficulty" type="number" min={1} max={5} required /></Field>
                <Field><FieldLabel htmlFor="experience">What happened?</FieldLabel><Textarea id="experience" name="experience" minLength={50} required /></Field>
                <Field><Button type="submit" disabled={busy}>{busy && <Spinner />}Share</Button></Field>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
        {mine.data?.map((m) => <div key={m.id} className="flex items-center justify-between rounded-md border p-3 text-sm">{m.companyName}: {m.role}<Badge variant={statusVariant(m.status === "APPROVED" ? "VERIFIED" : m.status === "REJECTED" ? "REJECTED" : "PENDING")}>{titleCase(m.status)}</Badge></div>)}
      </div>
    </div>
  )
}

function Counselling() {
  const slots = useApi<Slot[]>("/api/student/prep/counselling/slots")
  const mine = useApi<Slot[]>("/api/student/prep/counselling/mine")
  const act = (id: string, path: "book" | "cancel") => api(`/api/student/prep/counselling/${id}/${path}`, { method: "POST", body: {} }).then(() => { toast.success(path === "book" ? "Booked" : "Cancelled"); slots.reload(); mine.reload() }, toastError)
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Open slots</CardTitle></CardHeader><CardContent className="flex flex-col gap-2 text-sm">{slots.data?.map((s) => <div key={s.id} className="flex items-center justify-between gap-2"><span>{fmtDateTime(s.startsAt)} · {s.counsellor.name}</span><Button size="sm" onClick={() => act(s.id, "book")}>Book</Button></div>)}{slots.data?.length === 0 && <span className="text-muted-foreground">No open slots.</span>}</CardContent></Card>
      <Card><CardHeader><CardTitle>My bookings</CardTitle></CardHeader><CardContent className="flex flex-col gap-2 text-sm">{mine.data?.map((s) => <div key={s.id} className="flex items-center justify-between gap-2"><span>{fmtDateTime(s.startsAt)} · {s.counsellor.name} <Badge variant="outline">{titleCase(s.status ?? "")}</Badge></span>{s.status === "BOOKED" && <Button size="sm" variant="outline" onClick={() => act(s.id, "cancel")}>Cancel</Button>}</div>)}{mine.data?.length === 0 && <span className="text-muted-foreground">No bookings.</span>}</CardContent></Card>
    </div>
  )
}
