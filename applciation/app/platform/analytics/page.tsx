"use client"

import * as React from "react"
import Link from "next/link"
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { OptionSelect } from "@/components/option-select"
import { ApiClientError } from "@/lib/web/api"
import { fmtDateTime } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Summary = {
  generatedAt: string
  institutions: { total: number; active: number; suspended: number; registeredLast30Days: number; registeredInRange: number | null }
  users: {
    students: { total: number; active: number; withLogin: number }; staff: { total: number; active: number }; recruiters: { total: number; active: number }
    platformAdministrators: { total: number; active: number }
    activeUsers: { window: { from: string; to: string; defaulted: boolean }; distinctUsers: number; signIns: number; staff: number; students: number; recruiters: number }
  }
  placement: {
    drives: { total: number; published: number; closed: number; cancelled: number }; applications: { total: number; shortlisted: number; withdrawn: number }
    offers: { made: number; accepted: number; declined: number; revoked: number; historicalImported: number }
    placedStudents: number; registeredForPlacement: number; placementRate: number | null; rateDefinition: string
  }
  series: { unit: "day" | "month"; points: { period: string; institutionsRegistered: number; signIns: number; applications: number; offers: number }[] }
  recent: { registrations: { id: string; name: string; isActive: boolean; createdAt: string }[]; adminActivity: { id: string; action: string; at: string; outcome: "success" | "failure"; actor: { email: string | null } | null; institution: { name: string | null } | null }[] }
}
type Row = { id: string; name: string; isActive: boolean; createdAt: string; students: number; studentsActive: number; staff: number; staffActive: number; recruiters: number; recruitersActive: number; placed: number; registered: number; rate: number | null; drives: number; applications: number; offers: number }
type Table = { items: Row[]; page: number; total: number; totalPages: number }
type Sort = "name" | "status" | "createdAt" | "students" | "staff" | "recruiters" | "placed" | "rate" | "drives" | "applications" | "offers"

const statusCfg = { count: { label: "Institutions", color: "var(--chart-2)" } } satisfies ChartConfig
const seriesCfg = { institutionsRegistered: { label: "Institutions registered", color: "var(--chart-1)" }, signIns: { label: "Sign-ins", color: "var(--chart-2)" }, applications: { label: "Applications", color: "var(--chart-3)" }, offers: { label: "Offers", color: "var(--chart-4)" } } satisfies ChartConfig
const compareCfg = { students: { label: "Students", color: "var(--chart-2)" }, staff: { label: "Staff", color: "var(--chart-4)" } } satisfies ChartConfig
const n = (v: number) => v.toLocaleString()
const pct = (v: number | null) => (v === null ? "—" : `${v}%`)

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return <Card size="sm"><CardHeader><CardDescription>{label}</CardDescription><CardTitle className="text-2xl tabular-nums">{value}</CardTitle></CardHeader>{sub && <CardContent className="text-xs text-muted-foreground">{sub}</CardContent>}</Card>
}

/**
 * Platform analytics. Read-only. Every figure comes from the API, which computes it in the database and enforces who may see it.
 * Snapshots (institutions, people) describe now; flows (registrations, drives, applications, offers, placements, sign-ins) follow the date range.
 */
export default function PlatformAnalyticsPage() {
  const [f, setF] = React.useState({ from: "", to: "", institution: "", status: "all" })
  const [q, setQ] = React.useState(""); const [dq, setDq] = React.useState("")
  const [sort, setSort] = React.useState<Sort>("students"); const [order, setOrder] = React.useState<"asc" | "desc">("desc"); const [page, setPage] = React.useState(1)
  React.useEffect(() => { const t = setTimeout(() => { setDq(q.trim()); setPage(1) }, 300); return () => clearTimeout(t) }, [q])
  const base = { ...(f.from ? { from: f.from } : {}), ...(f.to ? { to: f.to } : {}), ...(f.institution ? { institution: f.institution } : {}), status: f.status }
  const bad = !!f.from && !!f.to && f.from > f.to
  const { data, error, loading } = useApi<Summary>(bad ? null : "/api/platform/analytics", base)
  const { data: tbl, error: tErr, loading: tLoading } = useApi<Table>(bad ? null : "/api/platform/analytics/institutions", { ...base, q: dq || undefined, sort, order, page, pageSize: 10 })
  const { data: insts } = useApi<{ items: { id: string; name: string }[] }>("/api/platform/institutions", { pageSize: 100, sort: "name", order: "asc" })
  const set = (k: keyof typeof f) => (v: string) => { setF((x) => ({ ...x, [k]: v })); setPage(1) }
  const sortBy = (k: Sort) => { if (k === sort) setOrder(order === "asc" ? "desc" : "asc"); else { setSort(k); setOrder(k === "name" ? "asc" : "desc") } setPage(1) }
  const arrow = (k: Sort) => (k === sort ? (order === "asc" ? " ▲" : " ▼") : "")

  if (error instanceof ApiClientError && [401, 403].includes(error.status)) return (
    <div className="mx-auto flex max-w-md flex-col gap-3 p-6">
      <Alert variant="destructive"><AlertTitle>Platform administrators only</AlertTitle><AlertDescription>{error.status === 401 ? "Sign in to continue." : error.message}</AlertDescription></Alert>
      <Button render={<Link href="/platform" />}>Go to platform sign-in</Button>
    </div>
  )
  const d = data
  const compare = (tbl?.items ?? []).map((r) => ({ name: r.name.length > 18 ? r.name.slice(0, 17) + "…" : r.name, students: r.students, staff: r.staff }))
  const statusData = d ? [{ name: "Active", count: d.institutions.active }, { name: "Suspended", count: d.institutions.suspended }] : []
  const head = (k: Sort, label: string, right = false) => <TableHead className={right ? "text-right" : undefined}><button type="button" onClick={() => sortBy(k)}>{label}{arrow(k)}</button></TableHead>

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-4 md:p-8">
      <header className="flex items-start justify-between gap-3">
        <div><h1 className="text-xl font-semibold tracking-tight">Platform analytics</h1><p className="text-sm text-muted-foreground">Counts and rates across institutions. No student or staff records are shown. Dates are UTC days.</p></div>
        <div className="flex gap-2"><Button variant="outline" size="sm" render={<Link href="/platform" />}>Institutions</Button><Button variant="outline" size="sm" render={<Link href="/platform/audit" />}>Audit log</Button></div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label="From date" type="date" className="w-40" value={f.from} onChange={(e) => set("from")(e.target.value)} />
        <Input aria-label="To date" type="date" className="w-40" value={f.to} onChange={(e) => set("to")(e.target.value)} />
        <OptionSelect className="w-56" placeholder="Institution" value={f.institution} onChange={set("institution")} options={[{ value: "", label: "All institutions" }, ...(insts?.items ?? []).map((i) => ({ value: i.id, label: i.name }))]} />
        {(["all", "active", "suspended"] as const).map((s) => <Button key={s} size="sm" variant={f.status === s ? "default" : "outline"} onClick={() => set("status")(s)}>{s === "all" ? "All statuses" : s === "active" ? "Active" : "Suspended"}</Button>)}
        <Button variant="ghost" size="sm" onClick={() => { setF({ from: "", to: "", institution: "", status: "all" }); setQ(""); setPage(1) }}>Clear</Button>
        {loading && d && <span role="status" className="text-xs text-muted-foreground">Updating…</span>}
      </div>
      <p className="text-xs text-muted-foreground">The date range applies to registrations, drives, applications, offers, placements and sign-ins. Totals of institutions and people are as of now.</p>
      {bad && <Alert variant="destructive"><AlertTitle>Check the dates</AlertTitle><AlertDescription>The start date must not be after the end date.</AlertDescription></Alert>}
      {!!error && !bad && <Alert variant="destructive"><AlertTitle>Could not load analytics</AlertTitle><AlertDescription>{error instanceof Error ? error.message : "Try again"}</AlertDescription></Alert>}
      {loading && !d && !bad && <div className="grid gap-3 md:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>}

      {d && (
        <>
          <section aria-label="Institutions" className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">Institutions</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Registered institutions" value={n(d.institutions.total)} />
              <Stat label="Active" value={n(d.institutions.active)} />
              <Stat label="Suspended" value={n(d.institutions.suspended)} />
              <Stat label={d.institutions.registeredInRange === null ? "Registered in the last 30 days" : "Registered in the range"} value={n(d.institutions.registeredInRange ?? d.institutions.registeredLast30Days)} />
            </div>
            {d.institutions.total === 0 && <p className="rounded-lg border p-4 text-center text-sm text-muted-foreground">No institutions match these filters.</p>}
          </section>

          <section aria-label="People" className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">People</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Stat label="Students" value={n(d.users.students.total)} sub={`${n(d.users.students.active)} active · ${n(d.users.students.withLogin)} with a login`} />
              <Stat label="Staff" value={n(d.users.staff.total)} sub={`${n(d.users.staff.active)} active`} />
              <Stat label="Recruiters" value={n(d.users.recruiters.total)} sub={`${n(d.users.recruiters.active)} active`} />
              <Stat label="Platform administrators" value={n(d.users.platformAdministrators.total)} sub={`${n(d.users.platformAdministrators.active)} active · all institutions`} />
              <Stat label="Signed in" value={n(d.users.activeUsers.distinctUsers)} sub={`${n(d.users.activeUsers.signIns)} sign-ins, ${d.users.activeUsers.window.defaulted ? "last 30 days" : "in the range"}`} />
            </div>
          </section>

          <section aria-label="Placement" className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">Placement</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Stat label="Placement drives" value={n(d.placement.drives.total)} sub={`${n(d.placement.drives.published)} open · ${n(d.placement.drives.closed)} closed · ${n(d.placement.drives.cancelled)} cancelled`} />
              <Stat label="Applications" value={n(d.placement.applications.total)} sub={`${n(d.placement.applications.shortlisted)} shortlisted · ${n(d.placement.applications.withdrawn)} withdrawn`} />
              <Stat label="Offers made" value={n(d.placement.offers.made)} sub={`${n(d.placement.offers.accepted)} accepted · ${n(d.placement.offers.declined)} declined`} />
              <Stat label="Placed students" value={n(d.placement.placedStudents)} sub={`of ${n(d.placement.registeredForPlacement)} registered for placement`} />
              <Stat label="Placement rate" value={pct(d.placement.placementRate)} sub={d.placement.rateDefinition} />
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1"><CardHeader><CardTitle>Institutions by status</CardTitle></CardHeader><CardContent>
              {d.institutions.total === 0 ? <p className="text-sm text-muted-foreground">Nothing to show.</p> : (
                <ChartContainer config={statusCfg} className="h-48 w-full"><BarChart data={statusData}><CartesianGrid vertical={false} /><XAxis dataKey="name" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} width={32} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="count" fill="var(--color-count)" radius={6} /></BarChart></ChartContainer>)}
            </CardContent></Card>
            <Card className="lg:col-span-2"><CardHeader><CardTitle>Activity over time</CardTitle><CardDescription>{d.series.unit === "day" ? "Per day" : "Per month"}{f.from || f.to ? "" : " · last 12 months"}</CardDescription></CardHeader><CardContent>
              <ChartContainer config={seriesCfg} className="h-56 w-full"><LineChart data={d.series.points}><CartesianGrid vertical={false} /><XAxis dataKey="period" tickLine={false} axisLine={false} minTickGap={24} /><YAxis allowDecimals={false} width={36} /><ChartTooltip content={<ChartTooltipContent />} /><ChartLegend content={<ChartLegendContent />} />
                {(["institutionsRegistered", "signIns", "applications", "offers"] as const).map((k) => <Line key={k} type="monotone" dataKey={k} stroke={`var(--color-${k})`} strokeWidth={2} dot={false} />)}</LineChart></ChartContainer>
            </CardContent></Card>
          </div>

          <Card><CardHeader><CardTitle>Institution comparison</CardTitle><CardDescription>Students and staff for the institutions on this page of the table below</CardDescription></CardHeader><CardContent>
            {compare.length === 0 ? <p className="text-sm text-muted-foreground">No institutions to compare.</p> : (
              <ChartContainer config={compareCfg} className="h-64 w-full"><BarChart data={compare}><CartesianGrid vertical={false} /><XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={60} /><YAxis allowDecimals={false} width={36} /><ChartTooltip content={<ChartTooltipContent />} /><ChartLegend content={<ChartLegendContent />} /><Bar dataKey="students" fill="var(--color-students)" radius={4} /><Bar dataKey="staff" fill="var(--color-staff)" radius={4} /></BarChart></ChartContainer>)}
          </CardContent></Card>

          <section aria-label="Institution-wise statistics" className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-medium">Institution-wise statistics</h2>
              <Input aria-label="Search institutions" className="w-64" placeholder="Search name or address" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            {tErr ? <Alert variant="destructive"><AlertTitle>Could not load the table</AlertTitle><AlertDescription>{tErr instanceof Error ? tErr.message : "Try again"}</AlertDescription></Alert>
              : tLoading && !tbl ? <Skeleton className="h-40 w-full" />
              : tbl && tbl.items.length === 0 ? <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">No institutions match.</p>
              : (
                <div className="overflow-x-auto rounded-lg border"><Table>
                  <TableHeader><TableRow>{head("name", "Institution")}{head("status", "Status")}{head("students", "Students", true)}{head("staff", "Staff", true)}{head("recruiters", "Recruiters", true)}{head("drives", "Drives", true)}{head("applications", "Applications", true)}{head("offers", "Offers", true)}{head("placed", "Placed", true)}{head("rate", "Rate", true)}</TableRow></TableHeader>
                  <TableBody>{tbl?.items.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell><div className="font-medium">{r.name}</div><div className="text-xs text-muted-foreground">registered {fmtDateTime(r.createdAt)}</div></TableCell>
                      <TableCell><Badge variant={r.isActive ? "default" : "secondary"}>{r.isActive ? "Active" : "Suspended"}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums">{n(r.students)}<div className="text-xs text-muted-foreground">{n(r.studentsActive)} active</div></TableCell>
                      <TableCell className="text-right tabular-nums">{n(r.staff)}<div className="text-xs text-muted-foreground">{n(r.staffActive)} active</div></TableCell>
                      <TableCell className="text-right tabular-nums">{n(r.recruiters)}<div className="text-xs text-muted-foreground">{n(r.recruitersActive)} active</div></TableCell>
                      <TableCell className="text-right tabular-nums">{n(r.drives)}</TableCell><TableCell className="text-right tabular-nums">{n(r.applications)}</TableCell><TableCell className="text-right tabular-nums">{n(r.offers)}</TableCell>
                      <TableCell className="text-right tabular-nums">{n(r.placed)}<div className="text-xs text-muted-foreground">of {n(r.registered)}</div></TableCell><TableCell className="text-right tabular-nums">{pct(r.rate)}</TableCell>
                    </TableRow>))}</TableBody>
                </Table></div>)}
            {tbl && tbl.total > 0 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground"><span>{n(tbl.total)} institution{tbl.total === 1 ? "" : "s"} · page {tbl.page} of {tbl.totalPages}</span>
                <div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={page >= tbl.totalPages} onClick={() => setPage(page + 1)}>Next</Button></div></div>)}
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardHeader><CardTitle>Recent institution registrations</CardTitle></CardHeader><CardContent>
              {d.recent.registrations.length === 0 ? <p className="text-sm text-muted-foreground">No registrations in this range.</p> : (
                <Table><TableBody>{d.recent.registrations.map((r) => <TableRow key={r.id}><TableCell className="font-medium">{r.name}</TableCell><TableCell><Badge variant={r.isActive ? "default" : "secondary"}>{r.isActive ? "Active" : "Suspended"}</Badge></TableCell><TableCell className="text-right text-xs text-muted-foreground">{fmtDateTime(r.createdAt)}</TableCell></TableRow>)}</TableBody></Table>)}
            </CardContent></Card>
            <Card><CardHeader><CardTitle>Recent administrative activity</CardTitle><CardDescription>From the platform audit log</CardDescription></CardHeader><CardContent>
              {d.recent.adminActivity.length === 0 ? <p className="text-sm text-muted-foreground">No administrative activity in this range.</p> : (
                <Table><TableBody>{d.recent.adminActivity.map((e) => <TableRow key={e.id}><TableCell className="font-mono text-xs">{e.action}</TableCell><TableCell className="text-xs">{e.actor?.email ?? "—"}</TableCell><TableCell><Badge variant={e.outcome === "success" ? "default" : "destructive"}>{e.outcome === "success" ? "Succeeded" : "Failed"}</Badge></TableCell><TableCell className="text-right text-xs text-muted-foreground">{fmtDateTime(e.at)}</TableCell></TableRow>)}</TableBody></Table>)}
            </CardContent></Card>
          </div>
        </>
      )}
    </div>
  )
}
