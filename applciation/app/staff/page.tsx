"use client"

import Link from "next/link"
import { ArrowUpRightIcon } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { fmtDate, fmtDateTime, fmtLpa, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Dash = {
  studentCounts?: { total: number; invited: number; active: number; awaitingReview: number; verified: number; onboarded: number; placed: number; registeredForPlacement: number }
  placementSplit?: { placed: number; unplaced: number; notRegistered: number }
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
  insights?: {
    ctc: { unit: string; count: number; min: number | null; max: number | null; average: number | null }
    ctcBuckets: { label: string; count: number }[]
    topHiring: { company: string; count: number }[]
    topPaying: { company: string; lpa: number }[]
    driveStatus: { status: string; count: number }[]
  }
  quickActions: { key: string; label: string }[]
}

/** Quick actions that already have a screen; the rest appear as their phase is built. */
const ACTION_LINKS: Record<string, string> = { import_students: "/staff/students/import", verification_queue: "/staff/verification", create_drive: "/staff/drives/new", approvals: "/staff/approvals", tickets: "/staff/tickets" }

const countCfg = { count: { label: "Students", color: "var(--chart-2)" } } satisfies ChartConfig
const ctcCfg = { count: { label: "Offers", color: "var(--chart-2)" } } satisfies ChartConfig

/** One bento tile. The `span` classes decide its width at each screen size; the grid does the rest. */
function Tile({ className = "", title, description, action, children }: { className?: string; title?: string; description?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className={`rounded-2xl ${className}`}>
      {(title || action) && (
        <CardHeader>
          {title && <CardTitle>{title}</CardTitle>}
          {description && <CardDescription>{description}</CardDescription>}
          {action}
        </CardHeader>
      )}
      <CardContent className="flex flex-1 flex-col gap-3 text-sm">{children}</CardContent>
    </Card>
  )
}

const Empty = ({ children }: { children: React.ReactNode }) => <span className="text-muted-foreground">{children}</span>

function Kpi({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <Card size="sm" className="rounded-2xl sm:col-span-3 lg:col-span-3">
      <CardHeader><CardDescription>{label}</CardDescription><CardTitle className="text-3xl tabular-nums">{value}</CardTitle>{hint && <CardDescription>{hint}</CardDescription>}</CardHeader>
    </Card>
  )
}

function Row({ label, value, href }: { label: React.ReactNode; value?: React.ReactNode; href?: string }) {
  const body = (
    <div className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/60">
      <span>{label}</span>
      <span className="flex items-center gap-1 text-muted-foreground">{value}{href && <ArrowUpRightIcon className="size-3.5" />}</span>
    </div>
  )
  return href ? <Link href={href}>{body}</Link> : body
}

export default function DashboardPage() {
  const { data, error, loading } = useApi<Dash>("/api/dashboard")

  if (error) return <Alert variant="destructive"><AlertTitle>Could not load the dashboard</AlertTitle><AlertDescription>{error instanceof Error ? error.message : "Try again"}</AlertDescription></Alert>
  if (!data) return <div className="grid gap-4 sm:grid-cols-6 lg:grid-cols-12">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-40 rounded-2xl sm:col-span-3 lg:col-span-3" />)}</div>

  const c = data.studentCounts, att = data.needsAttention, sp = data.placementSplit, pp = data.placementProgress, ins = data.insights
  const actions = data.quickActions.filter((a) => ACTION_LINKS[a.key])
  const pipeline = c ? [
    { stage: "Invited", count: c.invited }, { stage: "Active", count: c.active }, { stage: "Awaiting review", count: c.awaitingReview },
    { stage: "Verified", count: c.verified }, { stage: "Onboarded", count: c.onboarded }, { stage: "Placed", count: c.placed },
  ] : []
  const split = sp ? [
    { label: "Placed", n: sp.placed, tone: "bg-primary-foreground" }, { label: "Still looking", n: sp.unplaced, tone: "bg-primary-foreground/50" }, { label: "Not in placement", n: sp.notRegistered, tone: "bg-primary-foreground/20" },
  ] : []
  const splitTotal = split.reduce((a, s) => a + s.n, 0)

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-6 lg:grid-cols-12" aria-busy={loading}>
      {pp && (
        <Card className="rounded-2xl bg-primary text-primary-foreground sm:col-span-6 lg:col-span-5 lg:row-span-2">
          <CardHeader>
            <CardDescription className="text-primary-foreground/80">Placement progress</CardDescription>
            <CardTitle className="text-6xl font-semibold tabular-nums">{pp.overall.percentage}%</CardTitle>
            <CardDescription className="text-primary-foreground/80">{pp.overall.placed} of {pp.overall.total} registered students placed</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            {splitTotal > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex h-3 overflow-hidden rounded-full bg-primary-foreground/10">
                  {split.map((s) => <div key={s.label} className={s.tone} style={{ width: `${(s.n / splitTotal) * 100}%` }} title={`${s.label}: ${s.n}`} />)}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-primary-foreground/80">{split.map((s) => <span key={s.label}>{s.label} <b className="text-primary-foreground">{s.n}</b></span>)}</div>
              </div>
            )}
            <div className="flex flex-col gap-2">
              {pp.byDepartment.slice(0, 5).map((d) => (
                <div key={d.departmentId} className="flex items-center gap-3">
                  <span className="w-28 truncate">{d.name ?? d.code}</span>
                  <Progress value={d.percentage} className="flex-1" />
                  <span className="w-16 text-right tabular-nums text-primary-foreground/80">{d.placed}/{d.total}</span>
                </div>
              ))}
              {pp.byDepartment.length === 0 && <span className="text-primary-foreground/80">No registered students yet.</span>}
            </div>
          </CardContent>
        </Card>
      )}

      <Tile className="sm:col-span-3 lg:col-span-4 lg:row-span-2" title="Needs your attention" description="Things waiting on you">
        {att.sectionsAwaitingReview && <Row href="/staff/verification" label="Sections waiting for review" value={<><b className="text-foreground">{att.sectionsAwaitingReview.count}</b>{att.sectionsAwaitingReview.count > 0 && ` · oldest ${att.sectionsAwaitingReview.oldestWaitingDays}d`}</>} />}
        {att.offersAwaitingResponse && <Row href="/staff/offers" label="Offers awaiting a response" value={<><b className="text-foreground">{att.offersAwaitingResponse.count}</b>{att.offersAwaitingResponse.expiringWithin3Days > 0 && ` · ${att.offersAwaitingResponse.expiringWithin3Days} expiring soon`}</>} />}
        {att.approvalsPending !== undefined && <Row href="/staff/approvals" label="Approvals pending" value={<b className="text-foreground">{att.approvalsPending}</b>} />}
        {att.openTickets !== undefined && <Row href="/staff/tickets" label="Open support tickets" value={<b className="text-foreground">{att.openTickets}</b>} />}
        {att.drivesClosingSoon && (
          <div className="flex flex-col gap-1 border-t pt-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Closing in 3 days</span>
            {att.drivesClosingSoon.length
              ? att.drivesClosingSoon.map((d) => <Row key={d.id} href={`/staff/drives/${d.id}`} label={<>{d.company.name}, {d.role}</>} value={<Badge variant="secondary">{d._count.applications} applied</Badge>} />)
              : <Empty>No drives closing soon.</Empty>}
          </div>
        )}
      </Tile>

      <Tile className="sm:col-span-3 lg:col-span-3" title="Quick actions">
        {actions.length ? <div className="flex flex-col gap-2">{actions.map((a, i) => <Button key={a.key} variant={i === 0 ? "default" : "outline"} className="justify-start" render={<Link href={ACTION_LINKS[a.key]} />}>{a.label}</Button>)}</div> : <Empty>No actions for your role.</Empty>}
      </Tile>

      {data.offersThisWeek && (
        <Tile className="sm:col-span-3 lg:col-span-3" title="Offers this week" description={`${data.offersThisWeek.count} received`}>
          {data.offersThisWeek.latest.slice(0, 4).map((o) => <Row key={o.id} label={<>{o.student.name}<span className="text-muted-foreground"> · {o.company.name}</span></>} value={fmtLpa(o.packageLpa)} />)}
          {data.offersThisWeek.count === 0 && <Empty>No offers yet this week.</Empty>}
        </Tile>
      )}

      {c && (<>
        <Kpi label="Students" value={c.total} hint={`${c.registeredForPlacement} registered for placement`} />
        <Kpi label="Active accounts" value={c.active} hint={`${c.invited} invited`} />
        <Kpi label="Verified" value={c.verified} hint={`${c.awaitingReview} awaiting review`} />
        <Kpi label="Onboarded" value={c.onboarded} hint={`${c.placed} placed`} />
      </>)}

      {c && (
        <Tile className="sm:col-span-6 lg:col-span-6" title="Student pipeline" description="Where students are in onboarding and placement">
          <ChartContainer config={countCfg} className="h-56 w-full">
            <BarChart data={pipeline} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid horizontal={false} />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="stage" width={110} tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="var(--color-count)" radius={6} />
            </BarChart>
          </ChartContainer>
        </Tile>
      )}

      {ins && (
        <Tile className="sm:col-span-6 lg:col-span-6" title="CTC analysis" description={ins.ctc.count ? `${ins.ctc.count} accepted offers with a package` : "No accepted offers with a package yet"}>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[["Lowest", ins.ctc.min], ["Average", ins.ctc.average], ["Highest", ins.ctc.max]].map(([l, v]) => (
              <div key={l as string} className="rounded-xl bg-muted/50 p-3"><div className="text-xs text-muted-foreground">{l}</div><div className="text-lg font-semibold tabular-nums">{fmtLpa(v as number | null)}</div></div>
            ))}
          </div>
          {ins.ctcBuckets.length > 0 && (
            <ChartContainer config={ctcCfg} className="h-36 w-full">
              <BarChart data={ins.ctcBuckets}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} width={28} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={6} />
              </BarChart>
            </ChartContainer>
          )}
        </Tile>
      )}

      {ins && (<>
        <Tile className="sm:col-span-3 lg:col-span-4" title="Top hiring companies" description="By students hired">
          {ins.topHiring.length ? ins.topHiring.map((t, i) => <Row key={t.company} label={<><span className="text-muted-foreground">{i + 1}.</span> {t.company}</>} value={<b className="text-foreground">{t.count}</b>} />) : <Empty>No accepted offers yet.</Empty>}
        </Tile>
        <Tile className="sm:col-span-3 lg:col-span-4" title="Top paying companies" description="By highest package">
          {ins.topPaying.length ? ins.topPaying.map((t, i) => <Row key={t.company} label={<><span className="text-muted-foreground">{i + 1}.</span> {t.company}</>} value={<b className="text-foreground">{fmtLpa(t.lpa)}</b>} />) : <Empty>No packages recorded yet.</Empty>}
        </Tile>
        <Tile className="sm:col-span-6 lg:col-span-4" title="Drives" description="Status of all drives">
          {ins.driveStatus.length ? <div className="flex flex-wrap gap-2">{ins.driveStatus.map((d) => <div key={d.status} className="min-w-24 flex-1 rounded-xl bg-muted/50 p-3"><div className="text-2xl font-semibold tabular-nums">{d.count}</div><div className="text-xs text-muted-foreground">{titleCase(d.status)}</div></div>)}</div> : <Empty>No drives yet.</Empty>}
        </Tile>
      </>)}

      {data.upcoming && (
        <Tile className="sm:col-span-6 lg:col-span-12" title="Next 7 days" description="Drives and rounds coming up">
          {data.upcoming.drives.length + data.upcoming.rounds.length === 0 && <Empty>Nothing scheduled.</Empty>}
          <div className="grid gap-x-6 gap-y-1 lg:grid-cols-2">
            {data.upcoming.drives.map((d) => <Row key={d.id} href={`/staff/drives/${d.id}`} label={<>{d.company.name}, {d.role}</>} value={<>{fmtDate(d.driveDate)}{d.venue ? ` · ${d.venue}` : ""}</>} />)}
            {data.upcoming.rounds.map((r) => <Row key={r.id} href={`/staff/drives/${r.drive.id}`} label={<>{r.drive.company.name}: round {r.order} ({titleCase(r.type)})</>} value={fmtDateTime(r.scheduledAt)} />)}
          </div>
        </Tile>
      )}
    </div>
  )
}
