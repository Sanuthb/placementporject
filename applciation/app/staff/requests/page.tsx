"use client"

import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type R = { id: string; requestedStatus: string; reason: string; createdAt: string; student: { id: string; name: string; enrollmentNo: string; participationStatus: string } }

export default function RequestsPage() {
  const { data, reload } = useApi<R[]>("/api/participation-requests", { status: "PENDING" })
  const [busy, setBusy] = React.useState<string | null>(null)
  async function decide(id: string, decision: "APPROVED" | "REJECTED") {
    setBusy(id)
    try { await api(`/api/participation-requests/${id}/decide`, { method: "POST", body: { decision } }); toast.success(decision === "APPROVED" ? "Approved" : "Rejected"); reload() } catch (e) { toastError(e) } finally { setBusy(null) }
  }
  if (!data) return <Skeleton className="h-40" />
  return (
    <Table>
      <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Change</TableHead><TableHead>Reason</TableHead><TableHead>Asked</TableHead><TableHead className="text-right">Decision</TableHead></TableRow></TableHeader>
      <TableBody>
        {data.map((r) => (
          <TableRow key={r.id}>
            <TableCell>{r.student.name}<div className="text-xs text-muted-foreground">{r.student.enrollmentNo}</div></TableCell>
            <TableCell><Badge variant="outline">{titleCase(r.student.participationStatus)}</Badge> to <Badge>{titleCase(r.requestedStatus)}</Badge></TableCell>
            <TableCell className="text-muted-foreground">{r.reason}</TableCell>
            <TableCell>{fmtDate(r.createdAt)}</TableCell>
            <TableCell className="space-x-2 text-right"><Button size="sm" disabled={busy === r.id} onClick={() => decide(r.id, "APPROVED")}>Approve</Button><Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => decide(r.id, "REJECTED")}>Reject</Button></TableCell>
          </TableRow>
        ))}
        {data.length === 0 && <TableRow><TableCell colSpan={5} className="text-muted-foreground">No pending requests.</TableCell></TableRow>}
      </TableBody>
    </Table>
  )
}
