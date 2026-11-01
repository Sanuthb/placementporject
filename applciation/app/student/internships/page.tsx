"use client"

import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, statusVariant, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type I = { id: string; companyName: string | null; role: string; startDate: string; endDate: string; mentorName: string | null; status: string; evaluations: { evaluatorName: string; score: number; remarks: string | null }[] }
type Log = { id: string; weekStart: string; hours: number; summary: string; status: string; reviewComment: string | null }

export default function InternshipsPage() {
  const { data } = useApi<I[]>("/api/student/internships")
  if (!data) return <Skeleton className="h-48" />
  if (data.length === 0) return <p className="text-sm text-muted-foreground">No internship has been allotted to you yet.</p>
  return <div className="flex flex-col gap-6">{data.map((i) => <Internship key={i.id} i={i} />)}</div>
}

function Internship({ i }: { i: I }) {
  const logs = useApi<Log[]>(`/api/student/internships/${i.id}/logs`)
  const [busy, setBusy] = React.useState(false)
  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const form = e.currentTarget
    setBusy(true)
    try { await api(`/api/student/internships/${i.id}/logs`, { method: "POST", body: { weekStart: new Date(String(f.get("weekStart"))).toISOString(), hours: Number(f.get("hours")), summary: f.get("summary") } }); toast.success("Log submitted for review"); form.reset(); logs.reload() } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  return (
    <Card>
      <CardHeader><CardTitle>{i.companyName}: {i.role}</CardTitle><CardDescription>{fmtDate(i.startDate)} to {fmtDate(i.endDate)}{i.mentorName ? ` · Mentor ${i.mentorName}` : ""} · <Badge variant="outline">{titleCase(i.status)}</Badge></CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4">
        {i.evaluations.map((e, k) => <div key={k} className="rounded-md border p-3 text-sm"><span className="font-medium">{e.score}/100</span> · {e.evaluatorName}{e.remarks && <div className="text-muted-foreground">{e.remarks}</div>}</div>)}
        <Table>
          <TableHeader><TableRow><TableHead>Week of</TableHead><TableHead>Hours</TableHead><TableHead>What you did</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {logs.data?.map((l) => <TableRow key={l.id}><TableCell>{fmtDate(l.weekStart)}</TableCell><TableCell>{l.hours}</TableCell><TableCell className="max-w-xs text-muted-foreground">{l.summary}</TableCell><TableCell><Badge variant={statusVariant(l.status === "APPROVED" ? "VERIFIED" : l.status === "REJECTED" ? "REJECTED" : "PENDING")}>{titleCase(l.status)}</Badge>{l.reviewComment && <div className="text-xs text-muted-foreground">{l.reviewComment}</div>}</TableCell></TableRow>)}
            {logs.data?.length === 0 && <TableRow><TableCell colSpan={4} className="text-muted-foreground">No logs yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
        {i.status !== "COMPLETED" && i.status !== "TERMINATED" && (
          <form onSubmit={add}>
            <FieldGroup>
              <div className="grid gap-3 sm:grid-cols-2"><Field><FieldLabel htmlFor={`w${i.id}`}>Week starting</FieldLabel><Input id={`w${i.id}`} name="weekStart" type="date" required /></Field><Field><FieldLabel htmlFor={`h${i.id}`}>Hours worked</FieldLabel><Input id={`h${i.id}`} name="hours" type="number" min={1} max={80} required /></Field></div>
              <Field><FieldLabel htmlFor={`s${i.id}`}>What did you do this week?</FieldLabel><Textarea id={`s${i.id}`} name="summary" minLength={10} required /></Field>
              <Field><Button type="submit" disabled={busy}>{busy && <Spinner />}Submit weekly log</Button></Field>
            </FieldGroup>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
