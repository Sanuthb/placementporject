"use client"

import * as React from "react"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { hasRole, useAuth } from "@/lib/web/auth"
import { fmtDateTime, statusVariant, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Req = { id: string; action: string; status: string; summary: string; createdAt: string; decidedAt: string | null; decisionComment: string | null; requestedBy: { name: string }; decidedBy: { name: string } | null }
const STATUS = ["PENDING", "APPROVED", "REJECTED", "SENT_BACK"].map((v) => ({ value: v, label: titleCase(v) }))

export default function ApprovalsPage() {
  const { state } = useAuth()
  const isAdmin = state.status === "ready" && hasRole(state.profile, "TPO_ADMIN")
  const [status, setStatus] = React.useState("PENDING")
  const { data, loading, reload } = useApi<{ items: Req[] }>("/api/approvals", { status, limit: 100 })
  const [target, setTarget] = React.useState<Req | null>(null)
  const [comment, setComment] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  async function decide(decision: "APPROVE" | "REJECT" | "SEND_BACK") {
    setBusy(true)
    try { await api(`/api/approvals/${target!.id}/decide`, { method: "POST", body: { decision, ...(comment.trim() ? { comment: comment.trim() } : {}) } }); toast.success("Decision recorded"); setTarget(null); setComment(""); reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      <OptionSelect className="w-44" value={status} onChange={setStatus} options={[{ value: "", label: "All requests" }, ...STATUS]} placeholder="Status" />
      {loading && !data ? <Skeleton className="h-40" /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Request</TableHead><TableHead>Requested by</TableHead><TableHead>Status</TableHead><TableHead>Decision</TableHead>{isAdmin && <TableHead className="text-right">Action</TableHead>}</TableRow></TableHeader>
          <TableBody>
            {data?.items.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.summary}<div className="text-xs text-muted-foreground">{titleCase(r.action)} · {fmtDateTime(r.createdAt)}</div></TableCell>
                <TableCell>{r.requestedBy.name}</TableCell>
                <TableCell><Badge variant={statusVariant(r.status)}>{titleCase(r.status)}</Badge></TableCell>
                <TableCell className="text-muted-foreground">{r.decidedBy ? `${r.decidedBy.name}, ${fmtDateTime(r.decidedAt)}` : "—"}{r.decisionComment && <div>{r.decisionComment}</div>}</TableCell>
                {isAdmin && <TableCell className="text-right">{r.status === "PENDING" && <Button size="sm" onClick={() => setTarget(r)}>Review</Button>}</TableCell>}
              </TableRow>
            ))}
            {data?.items.length === 0 && <TableRow><TableCell colSpan={5} className="text-muted-foreground">No requests.</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}
      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Review request</DialogTitle><DialogDescription>{target?.summary}</DialogDescription></DialogHeader>
          <Field><FieldLabel htmlFor="c">Comment (optional)</FieldLabel><Textarea id="c" value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={busy} onClick={() => decide("SEND_BACK")}>Send back</Button>
            <Button variant="destructive" disabled={busy} onClick={() => decide("REJECT")}>Reject</Button>
            <Button disabled={busy} onClick={() => decide("APPROVE")}>{busy && <Spinner />}Approve</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
