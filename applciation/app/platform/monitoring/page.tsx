"use client"

import * as React from "react"
import Link from "next/link"
import { RefreshCwIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { OptionSelect } from "@/components/option-select"
import { ApiClientError } from "@/lib/web/api"
import { fmtDateTime } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Status = "healthy" | "degraded" | "unavailable" | "unknown" | "not_configured"
type JobState = "succeeded" | "failed" | "running" | "interrupted" | "overdue" | "no_run_recorded"
type Job = { path: string; schedule: string; description: string; nextDueAt: string | null; state: JobState | null; history: "recorded" | "unavailable" | "not recorded"; lastRunAt: string | null; lastSuccessAt: string | null; lastFailure: string | null; lastFailureAt: string | null; durationMs: number | null; attempts: number | null; failedAttempts: number | null }
const JOB_STATE: Record<JobState, { label: string; status: Status }> = {
  succeeded: { label: "Succeeded", status: "healthy" }, failed: { label: "Failed", status: "unavailable" }, running: { label: "Running", status: "unknown" },
  interrupted: { label: "Interrupted", status: "degraded" }, overdue: { label: "Overdue", status: "degraded" }, no_run_recorded: { label: "No run yet", status: "unknown" },
}
type Component = { key: string; label: string; status: Status; checkedAt: string; summary: string; evidence: string[]; latencyMs: number | null; details?: { jobs?: Job[]; imports?: { preview: number; processing: number; completed7d: number; stuck: number } } }
type Health = { checkedAt: string; cached: boolean; throttled: boolean; ageMs: number; overall: { status: Status; counts: Record<Status, number>; notes: string[] }; components: Component[] }
type Err = { id: string; at: string; service: string; status: number; code: string; method: string | null; path: string | null; requestId: string | null; message: string }
type Errors = { items: Err[]; page: number; total: number; totalPages: number; capacity?: number; retained: number; since: string | null; durable?: boolean; retentionDays?: number | null }

const STATUS: Record<Status, { label: string; className: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  healthy: { label: "Healthy", className: "", variant: "default" },
  degraded: { label: "Degraded", className: "border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200", variant: "outline" },
  unavailable: { label: "Unavailable", className: "", variant: "destructive" },
  unknown: { label: "Unknown", className: "", variant: "secondary" },
  not_configured: { label: "Not configured", className: "", variant: "outline" },
}
const Pill = ({ s, label }: { s: Status; label?: string }) => <Badge variant={STATUS[s].variant} className={STATUS[s].className}>{label ?? STATUS[s].label}</Badge>
const clock = (d: string) => new Date(d).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" })
const SERVICES = ["application", "database", "storage", "ai", "email", "auth", "other"]

/**
 * Platform monitoring. Read-only. Each card shows one dependency's status and the evidence behind it. Not configured and unknown are never shown as healthy.
 * If a refresh fails (for example the database is down, so sign-in cannot be confirmed) the page says so plainly; when an earlier result exists it is kept on screen
 * clearly marked as stale, with the time it was checked. Nothing is ever shown as current that could not be confirmed, and no sign-in is bypassed.
 */
export default function MonitoringPage() {
  const [forced, setForced] = React.useState(false)
  const { data, error, loading, reload } = useApi<Health>("/api/platform/monitoring", forced ? { refresh: "1" } : {})
  const [f, setF] = React.useState({ service: "", from: "", to: "" }); const [q, setQ] = React.useState(""); const [dq, setDq] = React.useState(""); const [page, setPage] = React.useState(1)
  React.useEffect(() => { const t = setTimeout(() => { setDq(q.trim()); setPage(1) }, 300); return () => clearTimeout(t) }, [q])
  const bad = !!f.from && !!f.to && f.from > f.to
  const { data: errs, error: eErr, loading: eLoading } = useApi<Errors>(bad ? null : "/api/platform/monitoring/errors", { ...(f.service ? { service: f.service } : {}), ...(f.from ? { from: f.from } : {}), ...(f.to ? { to: f.to } : {}), ...(dq ? { q: dq } : {}), page, pageSize: 10 })
  const refresh = () => { setForced(true); reload() }

  if (error instanceof ApiClientError && [401, 403].includes(error.status)) return (
    <div className="mx-auto flex max-w-md flex-col gap-3 p-6">
      <Alert variant="destructive"><AlertTitle>Platform administrators only</AlertTitle><AlertDescription>{error.status === 401 ? "Sign in to continue." : error.message}</AlertDescription></Alert>
      <Button render={<Link href="/platform" />}>Go to platform sign-in</Button>
    </div>
  )
  const jobs = data?.components.find((c) => c.key === "scheduledJobs")?.details?.jobs ?? []
  const stale = !!error && !!data
  const dbDown = error instanceof ApiClientError && error.code === "DATABASE_UNAVAILABLE"
  const requestId = error instanceof ApiClientError ? error.requestId : undefined
  const bg = data?.components.find((c) => c.key === "backgroundJobs")
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-xl font-semibold tracking-tight">System health</h1><p className="text-sm text-muted-foreground">Live checks of what the platform depends on. A status is only “Healthy” when a check just succeeded.</p></div>
        <div className="flex gap-2"><Button variant="outline" size="sm" render={<Link href="/platform" />}>Institutions</Button><Button variant="outline" size="sm" render={<Link href="/platform/analytics" />}>Analytics</Button><Button variant="outline" size="sm" render={<Link href="/platform/ai" />}>AI</Button><Button variant="outline" size="sm" render={<Link href="/platform/audit" />}>Audit log</Button></div>
      </header>

      {!!error && !data && (
        <Alert variant="destructive" role="alert" data-testid="connection-failure"><AlertTitle>Cannot reach the monitoring service</AlertTitle>
          <AlertDescription>{dbDown ? "The database is unavailable, so the platform cannot confirm your sign-in or load health data. Nothing is bypassed. An external uptime monitor on /api/health/ready is the reliable outage signal." : (error instanceof Error ? error.message : "Try again")}{requestId ? ` Reference: ${requestId}` : ""}</AlertDescription></Alert>
      )}
      {!!error && !!data && (
        <Alert role="alert" data-testid="stale-warning" className="border-amber-500 bg-amber-50 text-amber-950 dark:bg-amber-950 dark:text-amber-100"><AlertTitle>Showing the last known state (stale)</AlertTitle>
          <AlertDescription>{dbDown ? "The database is unavailable, so a new check could not be made." : `The refresh failed: ${error instanceof Error ? error.message : "try again"}.`} The figures below were checked at {fmtDateTime(data.checkedAt)} and may no longer be true. Use Refresh to try again.{requestId ? ` Reference: ${requestId}` : ""}</AlertDescription></Alert>
      )}
      {loading && !data && <div className="grid gap-3 md:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36" />)}</div>}

      {data && (
        <div className={`flex flex-col gap-5 ${stale ? "opacity-60" : ""}`} data-stale={stale}>
          <Card><CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div><CardDescription>Overall platform health</CardDescription><CardTitle className="flex items-center gap-3 text-2xl" aria-live="polite"><span>{STATUS[data.overall.status].label}</span><Pill s={data.overall.status} /></CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">{data.overall.counts.healthy} healthy · {data.overall.counts.degraded} degraded · {data.overall.counts.unavailable} unavailable · {data.overall.counts.unknown} unknown · {data.overall.counts.not_configured} not configured</p>
              {data.overall.notes.length > 0 && <p className="text-xs text-muted-foreground">{data.overall.notes.join(" · ")}</p>}</div>
            <div className="flex flex-col items-end gap-1"><Button onClick={refresh} disabled={loading}>{loading ? <Spinner /> : <RefreshCwIcon />}Refresh</Button>
              <span className="text-xs text-muted-foreground" data-testid="checked-at">{stale ? "Stale: last checked " : "Checked "}{clock(data.checkedAt)}{data.cached && !stale ? " (shared result)" : ""}</span>
              {data.throttled && <span role="status" className="text-xs text-amber-700 dark:text-amber-300">Refreshed too recently; showing the latest result.</span>}</div>
          </CardHeader></Card>

          <section aria-label="Dependencies" className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {data.components.filter((c) => !["scheduledJobs", "backgroundJobs"].includes(c.key)).map((c) => (
              <Card key={c.key} data-testid={`component-${c.key}`}><CardHeader><div className="flex items-center justify-between gap-2"><CardTitle className="text-base">{c.label}</CardTitle><Pill s={c.status} /></div><CardDescription>{c.summary}</CardDescription></CardHeader>
                <CardContent className="flex flex-col gap-1 text-xs text-muted-foreground">
                  <ul className="list-disc pl-4">{c.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
                  <div className="mt-1 flex justify-between"><span>{c.latencyMs !== null ? `${c.latencyMs} ms` : ""}</span><span>Checked {clock(c.checkedAt)}</span></div>
                </CardContent></Card>
            ))}
          </section>

          <section aria-label="Scheduled jobs" className="flex flex-col gap-2">
            <div className="flex items-center gap-2"><h2 className="text-sm font-medium">Scheduled jobs</h2>{(() => { const c = data.components.find((x) => x.key === "scheduledJobs"); return c ? <Pill s={c.status} /> : null })()}</div>
            <p className="text-xs text-muted-foreground">{data.components.find((x) => x.key === "scheduledJobs")?.summary}</p>
            {jobs.length === 0 ? <p className="rounded-lg border p-4 text-center text-sm text-muted-foreground">No scheduled jobs are registered.</p> : (
              <div className="overflow-x-auto rounded-lg border"><Table>
                <TableHeader><TableRow><TableHead>Job</TableHead><TableHead>State</TableHead><TableHead>Schedule (UTC)</TableHead><TableHead>Next due</TableHead><TableHead>Last run</TableHead><TableHead>Last success</TableHead><TableHead>Last failure</TableHead><TableHead>Duration</TableHead><TableHead>Attempts</TableHead></TableRow></TableHeader>
                <TableBody>{jobs.map((j) => (
                  <TableRow key={j.path} data-testid={`job-${j.path}`}><TableCell><div className="font-medium">{j.description}</div><div className="font-mono text-xs text-muted-foreground">{j.path}</div></TableCell>
                    <TableCell>{j.state ? <Pill s={JOB_STATE[j.state].status} label={JOB_STATE[j.state].label} /> : <span className="text-xs text-muted-foreground">{j.history === "unavailable" ? "Unavailable" : "Not recorded"}</span>}</TableCell>
                    <TableCell className="font-mono text-xs">{j.schedule}</TableCell><TableCell className="text-xs">{j.nextDueAt ? fmtDateTime(j.nextDueAt) : "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{j.lastRunAt ? fmtDateTime(j.lastRunAt) : "Not recorded"}</TableCell><TableCell className="text-xs text-muted-foreground">{j.lastSuccessAt ? fmtDateTime(j.lastSuccessAt) : "Not recorded"}</TableCell>
                    <TableCell className="max-w-xs text-xs text-muted-foreground">{j.lastFailure ? `${j.lastFailureAt ? fmtDateTime(j.lastFailureAt) + ": " : ""}${j.lastFailure}` : j.history === "recorded" ? "None" : "Not recorded"}</TableCell><TableCell className="text-xs text-muted-foreground">{j.durationMs !== null ? `${j.durationMs} ms` : "Not recorded"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{j.attempts === null ? "—" : j.failedAttempts ? `${j.attempts} (${j.failedAttempts} failed)` : j.attempts}</TableCell></TableRow>))}</TableBody>
              </Table></div>)}
          </section>

          {bg && (
            <Card data-testid="component-backgroundJobs"><CardHeader><div className="flex items-center justify-between gap-2"><CardTitle className="text-base">Background jobs</CardTitle><Pill s={bg.status} /></div><CardDescription>{bg.summary}</CardDescription></CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {bg.details?.imports && <p className="mb-1">Bulk imports: {bg.details.imports.preview} awaiting confirmation · {bg.details.imports.processing} processing · {bg.details.imports.completed7d} completed in 7 days · {bg.details.imports.stuck} stuck</p>}
                <ul className="list-disc pl-4">{bg.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul></CardContent></Card>
          )}
        </div>
      )}

      <section aria-label="Recent errors" className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Recent server errors</h2>
        <p className="text-xs text-muted-foreground">{errs ? (errs.durable === false ? `Partial view: the durable error record could not be read, so this shows only the memory of the server that answered${errs.since ? `, since ${fmtDateTime(errs.since)}` : ""}. Not durable and not shared between servers.` : `Stored in the database and shared by all servers, kept ${errs.retentionDays ?? 14} days (${errs.retained} held${errs.since ? `, oldest ${fmtDateTime(errs.since)}` : ""}).`) : "Stored in the database for 14 days."}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Input aria-label="Search errors" className="w-60" placeholder="Search path, code, message, request id" value={q} onChange={(e) => setQ(e.target.value)} />
          <OptionSelect className="w-40" placeholder="Service" value={f.service} onChange={(v) => { setF({ ...f, service: v }); setPage(1) }} options={[{ value: "", label: "All services" }, ...SERVICES.map((s) => ({ value: s, label: s }))]} />
          <Input aria-label="Errors from date" type="date" className="w-40" value={f.from} onChange={(e) => { setF({ ...f, from: e.target.value }); setPage(1) }} />
          <Input aria-label="Errors to date" type="date" className="w-40" value={f.to} onChange={(e) => { setF({ ...f, to: e.target.value }); setPage(1) }} />
        </div>
        {bad && <Alert variant="destructive"><AlertTitle>Check the dates</AlertTitle><AlertDescription>The start date must not be after the end date.</AlertDescription></Alert>}
        {!!eErr && !bad ? <Alert variant="destructive"><AlertTitle>Could not load errors</AlertTitle><AlertDescription>{eErr instanceof Error ? eErr.message : "Try again"}</AlertDescription></Alert>
          : eLoading && !errs ? <Skeleton className="h-28" />
          : errs && errs.items.length === 0 ? <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">{errs.retained === 0 ? "No server errors have been recorded in the retention period." : "No errors match."}</p>
          : errs && (
            <div className="overflow-x-auto rounded-lg border"><Table>
              <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Service</TableHead><TableHead>Endpoint</TableHead><TableHead>Code</TableHead><TableHead>Request id</TableHead><TableHead>Detail</TableHead></TableRow></TableHeader>
              <TableBody>{errs.items.map((e) => (
                <TableRow key={e.id}><TableCell className="whitespace-nowrap text-xs">{fmtDateTime(e.at)}</TableCell><TableCell><Badge variant="outline">{e.service}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{e.method} {e.path ?? "—"}</TableCell><TableCell className="font-mono text-xs">{e.status} {e.code}</TableCell><TableCell className="font-mono text-xs">{e.requestId ?? "—"}</TableCell><TableCell className="max-w-xs text-xs text-muted-foreground">{e.message}</TableCell></TableRow>))}</TableBody>
            </Table></div>)}
        {errs && errs.total > 0 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground"><span>{errs.total} error{errs.total === 1 ? "" : "s"} · page {errs.page} of {errs.totalPages}</span>
            <div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={page >= errs.totalPages} onClick={() => setPage(page + 1)}>Next</Button></div></div>)}
      </section>
    </div>
  )
}
