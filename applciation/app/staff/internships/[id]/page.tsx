"use client"

import * as React from "react"
import { useParams } from "next/navigation"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
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

type D = {
  id: string; role: string; companyName: string | null; status: string; startDate: string; endDate: string; student: { name: string; enrollmentNo: string }
  logs: { id: string; weekStart: string; hours: number; summary: string; status: string; reviewComment: string | null }[]
  evaluations: { id: string; evaluatorType: string; evaluatorName: string; score: number; remarks: string | null }[]
  summary: { approvedHours: number; logsAwaitingReview: number; averageScore: number | null }
}
const STATUS = ["ONGOING", "COMPLETED", "TERMINATED"].map((v) => ({ value: v, label: titleCase(v) }))

export default function InternshipPage() {
  const { id } = useParams<{ id: string }>()
  const { data, reload } = useApi<D>(`/api/internships/${id}`)
  const [type, setType] = React.useState("FACULTY")
  const [busy, setBusy] = React.useState(false)
  if (!data) return <Skeleton className="h-64" />
  async function run(fn: () => Promise<unknown>, ok: string) { setBusy(true); try { await fn(); toast.success(ok); reload() } catch (e) { toastError(e) } finally { setBusy(false) } }
  async function evaluate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    await run(() => api(`/api/internships/${id}/evaluations`, { method: "POST", body: { evaluatorType: type, evaluatorName: f.get("name"), score: Number(f.get("score")), ...(String(f.get("remarks")) ? { remarks: f.get("remarks") } : {}) } }), "Evaluation saved")
  }
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader><CardTitle>{data.student.name}: {data.role}</CardTitle><CardDescription>{data.companyName} · {fmtDate(data.startDate)} to {fmtDate(data.endDate)} · {data.summary.approvedHours} approved hours{data.summary.averageScore !== null ? ` · average score ${data.summary.averageScore}` : ""}</CardDescription></CardHeader>
        <CardContent><OptionSelect className="w-48" value={data.status === "ALLOTTED" ? "ONGOING" : data.status} onChange={(v) => run(() => api(`/api/internships/${id}`, { method: "PATCH", body: { status: v } }), "Status updated")} options={STATUS} placeholder="Status" /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Weekly work logs</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Week</TableHead><TableHead>Hours</TableHead><TableHead>Summary</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Review</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.logs.map((l) => <TableRow key={l.id}><TableCell>{fmtDate(l.weekStart)}</TableCell><TableCell>{l.hours}</TableCell><TableCell className="max-w-xs text-muted-foreground">{l.summary}</TableCell><TableCell><Badge variant={statusVariant(l.status === "APPROVED" ? "VERIFIED" : l.status === "REJECTED" ? "REJECTED" : "PENDING")}>{titleCase(l.status)}</Badge>{l.reviewComment && <div className="text-xs text-muted-foreground">{l.reviewComment}</div>}</TableCell><TableCell className="text-right">{l.status === "SUBMITTED" && <Button size="sm" disabled={busy} onClick={() => run(() => api(`/api/internships/${id}/logs/${l.id}/review`, { method: "POST", body: { decision: "APPROVE" } }), "Log approved")}>Approve</Button>}</TableCell></TableRow>)}
              {data.logs.length === 0 && <TableRow><TableCell colSpan={5} className="text-muted-foreground">No logs submitted yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Evaluations</CardTitle></CardHeader><CardContent className="flex flex-col gap-2 text-sm">{data.evaluations.map((e) => <div key={e.id} className="rounded-md border p-3"><span className="font-medium">{e.score}/100</span> · {titleCase(e.evaluatorType)} · {e.evaluatorName}{e.remarks && <div className="text-muted-foreground">{e.remarks}</div>}</div>)}{data.evaluations.length === 0 && <span className="text-muted-foreground">None yet.</span>}</CardContent></Card>
        <Card>
          <CardHeader><CardTitle>Add an evaluation</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={evaluate}>
              <FieldGroup>
                <Field><FieldLabel>Evaluated by</FieldLabel><OptionSelect className="w-full" value={type} onChange={setType} options={[{ value: "FACULTY", label: "Faculty" }, { value: "COMPANY", label: "Company" }]} placeholder="Type" /></Field>
                <Field><FieldLabel htmlFor="name">Evaluator name</FieldLabel><Input id="name" name="name" minLength={2} required /></Field>
                <Field><FieldLabel htmlFor="score">Score (0 to 100)</FieldLabel><Input id="score" name="score" type="number" min={0} max={100} required /></Field>
                <Field><FieldLabel htmlFor="remarks">Remarks</FieldLabel><Textarea id="remarks" name="remarks" /></Field>
                <Field><Button type="submit" disabled={busy}>{busy && <Spinner />}Save evaluation</Button></Field>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
