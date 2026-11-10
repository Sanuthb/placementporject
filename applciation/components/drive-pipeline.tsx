"use client"

import * as React from "react"

import { PlacementJourney, type JourneyStatus } from "@/components/placement-journey"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { STEPS } from "@/lib/placementStatus"
import { useApi } from "@/lib/web/use-api"

type Row = { applicationId: string; student: { id: string; name: string; enrollmentNo: string }; stage: { key: string; label: string; next: string | null }; readiness: { score: number; coverage: number; gate: string; gateLabel: string } | null }
type Data = { counts: { total: number; reachedCount: Record<string, number> }; readiness: boolean; rows: Row[] }

/** Where every applicant stands in the placement status steps, with the job-readiness of each beside their eligibility. */
export function DrivePipeline({ driveId }: { driveId: string }) {
  const { data } = useApi<Data>(`/api/drives/${driveId}/pipeline`)
  const [open, setOpen] = React.useState<Row | null>(null)
  const detail = useApi<{ student: { name: string }; status: JourneyStatus }>(open ? `/api/drives/${driveId}/applications/${open.applicationId}/status` : null)
  if (!data) return <Skeleton className="h-48" />
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">{STEPS.filter(([k]) => data.counts.reachedCount[k] > 0 || k === "APPLICATION_RECEIVED").map(([k, label]) => <Badge key={k} variant="outline">{label}: {data.counts.reachedCount[k]}</Badge>)}</div>
      {data.readiness && <p className="text-sm text-muted-foreground">Readiness is the Job-Specific Readiness Score for this job. It is for coaching and review; eligibility is shown separately and is not changed by it.</p>}
      <Table>
        <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Status</TableHead><TableHead>Next</TableHead>{data.readiness && <><TableHead>Eligibility</TableHead><TableHead className="text-right">Readiness</TableHead></>}<TableHead /></TableRow></TableHeader>
        <TableBody>
          {data.rows.map((r) => (
            <TableRow key={r.applicationId}>
              <TableCell className="font-medium">{r.student.name}<div className="text-xs font-normal text-muted-foreground">{r.student.enrollmentNo}</div></TableCell>
              <TableCell><Badge variant={r.stage.key === "REJECTED" || r.stage.key === "WITHDRAWN" ? "destructive" : "secondary"}>{r.stage.label}</Badge></TableCell>
              <TableCell className="text-xs text-muted-foreground">{r.stage.next ?? "-"}</TableCell>
              {data.readiness && <><TableCell>{r.readiness ? <Badge variant={r.readiness.gate === "NOT_ELIGIBLE" ? "destructive" : "default"}>{r.readiness.gateLabel}</Badge> : "-"}</TableCell><TableCell className="text-right">{r.readiness ? <>{r.readiness.score}<div className="text-xs text-muted-foreground">{r.readiness.coverage}% measured</div></> : "-"}</TableCell></>}
              <TableCell><Button size="sm" variant="outline" onClick={() => setOpen(r)}>History</Button></TableCell>
            </TableRow>
          ))}
          {data.rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-muted-foreground">No applications yet.</TableCell></TableRow>}
        </TableBody>
      </Table>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader><DialogTitle>{open?.student.name}</DialogTitle><DialogDescription>Placement status, with the date and the person behind each step.</DialogDescription></DialogHeader>
          {detail.data ? <PlacementJourney status={detail.data.status} /> : <Skeleton className="h-40" />}
        </DialogContent>
      </Dialog>
    </div>
  )
}
