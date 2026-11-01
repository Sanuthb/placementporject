"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, fmtDateTime } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Block = { id: string; reason: string; startsAt: string; endsAt: string }

export default function BlocksPage() {
  const router = useRouter()
  const { data } = useApi<Block[]>("/api/student/blocks")
  const hist = useApi<{ drives: { driveId: string; company: string; role: string; driveDate: string; attended: boolean; excused: boolean; markedAt: string }[]; missed: number; rules: { text: string }[]; warning: string | null }>("/api/student/attendance/history")
  const [why, setWhy] = React.useState<Record<string, string>>({})
  const [busy, setBusy] = React.useState<string | null>(null)
  if (!data) return <Skeleton className="h-40" />
  async function appeal(b: Block) {
    setBusy(b.id)
    try {
      const t = await api<{ id: string }>("/api/student/tickets", { method: "POST", body: { category: "APPLICATION_ISSUE", subject: `Please review my block (${b.reason.slice(0, 80)})`, message: `Block from ${fmtDate(b.startsAt)} to ${fmtDate(b.endsAt)}: ${b.reason}\n\nWhy I am asking for a review:\n${why[b.id]}` } })
      toast.success("Request sent to the placement office"); router.push(`/student/support/${t.id}`)
    } catch (e) { toastError(e) } finally { setBusy(null) }
  }
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {data.length === 0 && <Alert><AlertTitle>You are not blocked</AlertTitle><AlertDescription>You can apply to any drive you are eligible for.</AlertDescription></Alert>}
      {data.map((b) => (
        <Card key={b.id}>
          <CardHeader><CardTitle>{b.reason}</CardTitle><CardDescription>From {fmtDate(b.startsAt)} until {fmtDate(b.endsAt)}. You cannot apply to drives during this time.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Field><FieldLabel htmlFor={`w${b.id}`}>Ask the placement office to review this block</FieldLabel><Textarea id={`w${b.id}`} rows={3} value={why[b.id] ?? ""} onChange={(e) => setWhy({ ...why, [b.id]: e.target.value })} /></Field>
            <Button className="self-start" disabled={busy === b.id || (why[b.id] ?? "").trim().length < 10} onClick={() => appeal(b)}>{busy === b.id && <Spinner />}Send review request</Button>
          </CardContent>
        </Card>
      ))}
      {hist.data?.warning && <Alert variant="destructive"><AlertTitle>Careful</AlertTitle><AlertDescription>{hist.data.warning}</AlertDescription></Alert>}
      <Card>
        <CardHeader><CardTitle>The college&apos;s blocking rules</CardTitle><CardDescription>You get a notification when a block starts, changes or ends.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {hist.data?.rules.map((r) => <p key={r.text}>{r.text}</p>)}
          {hist.data?.rules.length === 0 && <span className="text-muted-foreground">Your college has not set any automatic blocking rules.</span>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>My attendance</CardTitle><CardDescription>{hist.data ? `${hist.data.drives.filter((d) => d.attended).length} attended, ${hist.data.missed} missed` : "Loading"}</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Drive</TableHead><TableHead>Date</TableHead><TableHead>Result</TableHead></TableRow></TableHeader>
            <TableBody>
              {hist.data?.drives.map((d) => <TableRow key={d.driveId}><TableCell>{d.company}: {d.role}</TableCell><TableCell>{fmtDate(d.driveDate)}</TableCell><TableCell>{d.attended ? <Badge>Attended {fmtDateTime(d.markedAt)}</Badge> : d.excused ? <Badge variant="secondary">Excused</Badge> : <Badge variant="destructive">Missed</Badge>}</TableCell></TableRow>)}
              {hist.data?.drives.length === 0 && <TableRow><TableCell colSpan={3} className="text-muted-foreground">No attendance recorded yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
