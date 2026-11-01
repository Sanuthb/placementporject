"use client"

import * as React from "react"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, statusVariant, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Req = { id: string; requestedStatus: string; reason: string; status: string; decisionComment: string | null; createdAt: string }
type Me = { participationStatus: string; participationReason: string | null }
const STATUSES = ["REGISTERED", "OPTED_OUT", "HIGHER_STUDIES", "ENTREPRENEURSHIP"].map((v) => ({ value: v, label: titleCase(v) }))

export default function StatusPage() {
  const me = useApi<Me>("/api/student/me")
  const reqs = useApi<Req[]>("/api/student/participation-requests")
  const [status, setStatus] = React.useState("")
  const [reason, setReason] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  if (!me.data || !reqs.data) return <Skeleton className="h-48" />
  async function submit() {
    setBusy(true)
    try { await api("/api/student/participation-requests", { method: "POST", body: { requestedStatus: status, reason: reason.trim() } }); toast.success("Request sent to the placement cell"); setReason(""); reqs.reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  const pending = reqs.data.some((r) => r.status === "PENDING")
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Card>
        <CardHeader><CardTitle>Placement participation</CardTitle><CardDescription>Your current status: <Badge variant={statusVariant(me.data.participationStatus)}>{titleCase(me.data.participationStatus)}</Badge>{me.data.participationReason && ` · ${me.data.participationReason}`}</CardDescription></CardHeader>
        <CardContent>
          <FieldGroup>
            <Field><FieldLabel>I want to change it to</FieldLabel><OptionSelect className="w-full" value={status} onChange={setStatus} options={STATUSES} placeholder="Choose a status" /></Field>
            <Field><FieldLabel htmlFor="why">Reason</FieldLabel><Textarea id="why" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            <Field><Button disabled={busy || pending || !status || reason.trim().length < 5} onClick={submit}>{busy && <Spinner />}Send request</Button>{pending && <span className="text-sm text-muted-foreground">You already have a request waiting for a decision.</span>}</Field>
          </FieldGroup>
        </CardContent>
      </Card>
      {reqs.data.map((r) => <Card key={r.id} size="sm"><CardContent className="text-sm">{titleCase(r.requestedStatus)} · <Badge variant={statusVariant(r.status)}>{titleCase(r.status)}</Badge><div className="text-muted-foreground">{r.reason}{r.decisionComment ? ` — ${r.decisionComment}` : ""} ({fmtDate(r.createdAt)})</div></CardContent></Card>)}
    </div>
  )
}
