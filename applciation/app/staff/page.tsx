"use client"

import Link from "next/link"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmtDate, fmtDateTime, fmtLpa, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Dash = {
  studentCounts?: { total: number; invited: number; active: number; awaitingReview: number; verified: number; onboarded: number; placed: number; registeredForPlacement: number }
  placementProgress?: { overall: { placed: number; total: number; percentage: number }; byDepartment: { departmentId: string; name?: string; code?: string; placed: number; total: number; percentage: number }[]; byBatch: { batchId: string; name?: string; placed: number; total: number; percentage: number }[] }
  needsAttention: {
    sectionsAwaitingReview?: { count: number; oldestWaitingDays: number }
    drivesClosingSoon?: { id: string; role: string; applicationDeadline: string; company: { name: string }; _count: { applications: number } }[]
    offersAwaitingResponse?: { count: number; expiringWithin3Days: number }
    approvalsPending?: number
    openTickets?: number
  }
  upcoming?: { drives: { id: string; role: string; driveDate: string; venue: string | null; company: { name: string } }[]; rounds: { id: string; order: number; type: string; scheduledAt: string; venue: string | null; drive: { id: string; role: string; company: { name: string } } }[] }
  offersThisWeek?: { count: number; latest: { id: string; role: string; packageLpa: number | string | null; status: string; offeredAt: string; student: { id: string; name: string }; company: { name: string } }[] }
  quickActions: { key: string; label: string }[]
}

/** Quick actions that already have a screen; the rest appear as their phase is built. */
const ACTION_LINKS: Record<string, string> = { import_students: "/staff/students/import", verification_queue: "/staff/verification" }

export default function DashboardPage() {
  const { data, error, loading } = useApi<Dash>("/api/dashboard")

  if (error) return <Alert variant="destructive"><AlertTitle>Could not load the dashboard</AlertTitle><AlertDescription>{error instanceof Error ? error.message : "Try again"}</AlertDescription></Alert>
  if (!data) return <div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>

  const c = data.studentCounts
  const stats = c ? [
    ["Students", c.total], ["Invited", c.invited], ["Active", c.active], ["Awaiting review", c.awaitingReview],
    ["Verified", c.verified], ["Onboarded", c.onboarded], ["Placed", c.placed], ["Registered for placement", c.registeredForPlacement],
  ] as const : []
  const att = data.needsAttention
  const actions = data.quickActions.filter((a) => ACTION_LINKS[a.key])

  return (
    <div className="flex flex-col gap-4" aria-busy={loading}>
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {actions.map((a, i) => <Button key={a.key} variant={i === 0 ? "default" : "outline"} render={<Link href={ACTION_LINKS[a.key]} />}>{a.label}</Button>)}
        </div>
      )}

      {c && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map(([label, n]) => (
            <Card key={label} size="sm"><CardHeader><CardDescription>{label}</CardDescription><CardTitle className="text-2xl">{n}</CardTitle></CardHeader></Card>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {data.placementProgress && (
          <Card>
            <CardHeader>
              <CardTitle>Placement progress</CardTitle>
              <CardDescription>{data.placementProgress.overall.placed} of {data.placementProgress.overall.total} registered students placed ({data.placementProgress.overall.percentage}%)</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Progress value={data.placementProgress.overall.percentage} />
              <Table>
                <TableHeader><TableRow><TableHead>Department</TableHead><TableHead className="text-right">Placed</TableHead><TableHead className="text-right">%</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data.placementProgress.byDepartment.map((d) => (
                    <TableRow key={d.departmentId}><TableCell>{d.name ?? d.code}</TableCell><TableCell className="text-right">{d.placed}/{d.total}</TableCell><TableCell className="text-right">{d.percentage}%</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle>Needs your attention</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {att.sectionsAwaitingReview && (
              <div className="flex items-center justify-between gap-2">
                <span>{att.sectionsAwaitingReview.count} sections waiting for review{att.sectionsAwaitingReview.count ? `, oldest ${att.sectionsAwaitingReview.oldestWaitingDays} days` : ""}</span>
                <Button size="sm" variant="outline" render={<Link href="/staff/verification" />}>Open queue</Button>
              </div>
            )}
            {att.offersAwaitingResponse && <div>{att.offersAwaitingResponse.count} offers awaiting a response ({att.offersAwaitingResponse.expiringWithin3Days} expiring within 3 days)</div>}
            {att.approvalsPending !== undefined && <div>{att.approvalsPending} approvals pending</div>}
            {att.openTickets !== undefined && <div>{att.openTickets} open support tickets</div>}
            {att.drivesClosingSoon && (
              att.drivesClosingSoon.length
                ? att.drivesClosingSoon.map((d) => <div key={d.id} className="flex items-center justify-between gap-2"><span>{d.company.name}, {d.role} closes {fmtDateTime(d.applicationDeadline)}</span><Badge variant="secondary">{d._count.applications} applied</Badge></div>)
                : <div className="text-muted-foreground">No drives closing in the next 3 days.</div>
            )}
          </CardContent>
        </Card>

        {data.upcoming && (
          <Card>
            <CardHeader><CardTitle>Next 7 days</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {data.upcoming.drives.length + data.upcoming.rounds.length === 0 && <span className="text-muted-foreground">Nothing scheduled.</span>}
              {data.upcoming.drives.map((d) => <div key={d.id} className="flex justify-between gap-2"><span>{d.company.name}, {d.role}</span><span className="text-muted-foreground">{fmtDate(d.driveDate)}{d.venue ? ` · ${d.venue}` : ""}</span></div>)}
              {data.upcoming.rounds.map((r) => <div key={r.id} className="flex justify-between gap-2"><span>{r.drive.company.name}: round {r.order} ({titleCase(r.type)})</span><span className="text-muted-foreground">{fmtDateTime(r.scheduledAt)}</span></div>)}
            </CardContent>
          </Card>
        )}

        {data.offersThisWeek && (
          <Card>
            <CardHeader><CardTitle>Offers this week</CardTitle><CardDescription>{data.offersThisWeek.count} received</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {data.offersThisWeek.latest.map((o) => (
                <div key={o.id} className="flex items-center justify-between gap-2">
                  <span>{o.student.name}, {o.company.name} ({o.role})</span>
                  <span className="text-muted-foreground">{fmtLpa(o.packageLpa)}</span>
                </div>
              ))}
              {data.offersThisWeek.count === 0 && <span className="text-muted-foreground">No offers yet this week.</span>}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
