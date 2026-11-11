"use client"

import * as React from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ApiClientError, api } from "@/lib/web/api"
import { fmtDateTime } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Breakdown = { key: string; calls: number; failures: number; timeouts: number; rateLimited: number; blocked: number; avgMs: number | null }
type Today = { scope: string; kind: string; key: string; used: number; limit: number | null; ratio: number | null }
type Usage = {
  days: number
  totals: { calls: number; failures: number; timeouts: number; rateLimited: number; blocked: number; avgMs: number | null }
  byPurpose: Breakdown[]; byProvider: Breakdown[]; byModel: Breakdown[]; byFeature: Breakdown[]
  trend: { day: string; calls: number; failures: number; blocked: number }[]
  colleges: { page: number; pageSize: number; total: number; rows: { collegeKey: string; name: string; calls: number; failures: number; blocked: number; avgMs: number | null }[] }
  today: Today[]
}
type Limit = { kind: "COLLEGE_DEFAULT" | "COLLEGE" | "PROVIDER" | "PURPOSE"; key: string; dailyCalls: number; updatedAt: string }
type Limits = { limits: Limit[]; max: number }

const errText = (e: unknown) => (e instanceof ApiClientError ? e.message : e instanceof Error ? e.message : "Something went wrong")
const KIND_LABEL: Record<Limit["kind"], string> = { COLLEGE_DEFAULT: "Every institution (default)", COLLEGE: "One institution", PROVIDER: "Provider (whole platform)", PURPOSE: "Purpose (whole platform)" }
const num = (n: number) => n.toLocaleString("en-IN")

function Stat({ label, value, id, tone }: { label: string; value: string; id: string; tone?: "bad" }) {
  return <div className="rounded-lg border p-3" data-testid={id}><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-semibold ${tone === "bad" ? "text-destructive" : ""}`}>{value}</div></div>
}

function Table({ title, rows, id }: { title: string; rows: Breakdown[]; id: string }) {
  return (
    <div data-testid={id}>
      <h3 className="mb-1 text-sm font-medium">{title}</h3>
      {rows.length === 0 ? <p className="text-xs text-muted-foreground">No calls in this period.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-muted-foreground"><tr><th className="py-1 pr-3 font-normal">Name</th><th className="px-2 font-normal">Calls</th><th className="px-2 font-normal">Failed</th><th className="px-2 font-normal">Timed out</th><th className="px-2 font-normal">Rate limited</th><th className="px-2 font-normal">Refused by limit</th><th className="px-2 font-normal">Avg ms</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.key} className="border-t"><td className="py-1 pr-3 font-medium">{r.key}</td><td className="px-2">{num(r.calls)}</td><td className="px-2">{num(r.failures)}</td><td className="px-2">{num(r.timeouts)}</td><td className="px-2">{num(r.rateLimited)}</td><td className="px-2">{num(r.blocked)}</td><td className="px-2">{r.avgMs ?? "—"}</td></tr>)}</tbody></table></div>
      )}
    </div>
  )
}

function LimitsEditor({ today, colleges }: { today: Today[]; colleges: Usage["colleges"]["rows"] }) {
  const { data, error, loading, reload } = useApi<Limits>("/api/platform/ai/limits")
  const [kind, setKind] = React.useState<Limit["kind"]>("COLLEGE_DEFAULT")
  const [key, setKey] = React.useState("*")
  const [value, setValue] = React.useState("")
  const [busy, setBusy] = React.useState<string | null>(null)
  const [err, setErr] = React.useState<string | null>(null)
  const max = data?.max ?? 10_000_000
  const n = Number(value)
  const valueBad = value !== "" && (!Number.isInteger(n) || n < 0 || n > max)
  const keyBad = (kind === "COLLEGE" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) || (kind === "PROVIDER" && !["GROQ", "ANTHROPIC"].includes(key)) || (kind === "PURPOSE" && !["TEXT", "VISION", "INTERVIEW"].includes(key))

  function pick(k: Limit["kind"]) { setKind(k); setKey(k === "COLLEGE_DEFAULT" ? "*" : k === "PROVIDER" ? "GROQ" : k === "PURPOSE" ? "TEXT" : ""); setErr(null) }
  async function put(k: Limit["kind"], kk: string, dailyCalls: number | null, ok: string) {
    setBusy(`${k}:${kk}`); setErr(null)
    try { await api("/api/platform/ai/limits", { method: "PUT", body: { kind: k, key: kk, dailyCalls } }); toast.success(ok); setValue(""); reload() }
    catch (x) { setErr(errText(x)) } finally { setBusy(null) }
  }
  const usedOf = (l: Limit) => today.find((t) => t.kind === (l.kind === "COLLEGE" ? "college" : l.kind === "PROVIDER" ? "provider" : l.kind === "PURPOSE" ? "purpose" : "-") && t.key === l.key)?.used ?? 0

  return (
    <Card data-testid="ai-limits">
      <CardHeader><CardTitle className="text-base">Daily limits</CardTitle><CardDescription>No limit is set unless you set one. Limits count AI calls per day (UTC) and refuse further calls with a clear message until the next day. A limit of 0 stops every call in that scope. Setting an empty value is not allowed: remove the limit instead.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {!!error && <Alert variant="destructive" role="alert"><AlertTitle>Could not load the limits</AlertTitle><AlertDescription>{errText(error)}</AlertDescription></Alert>}
        {loading && !data && <Skeleton className="h-16" />}
        {data && (data.limits.length === 0 ? <p className="text-muted-foreground" data-testid="ai-limits-empty">No limits are set. Every AI call is allowed.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-left text-xs" data-testid="ai-limits-table"><thead className="text-muted-foreground"><tr><th className="py-1 pr-3 font-normal">Applies to</th><th className="px-2 font-normal">Limit per day</th><th className="px-2 font-normal">Used today</th><th className="px-2 font-normal">Changed</th><th /></tr></thead>
            <tbody>{data.limits.map((l) => {
              const used = usedOf(l), pct = l.dailyCalls ? used / l.dailyCalls : used > 0 ? 1 : 0
              const name = l.kind === "COLLEGE" ? (colleges.find((c) => c.collegeKey === l.key)?.name ?? l.key) : l.key === "*" ? "All institutions" : l.key
              return <tr key={`${l.kind}:${l.key}`} className="border-t"><td className="py-1 pr-3"><span className="font-medium">{name}</span> <span className="text-muted-foreground">· {KIND_LABEL[l.kind]}</span></td><td className="px-2">{num(l.dailyCalls)}</td>
                <td className="px-2">{l.kind === "COLLEGE_DEFAULT" ? "per institution" : <>{num(used)} {pct >= 1 ? <Badge variant="destructive">Reached</Badge> : pct >= 0.8 ? <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-300">{Math.round(pct * 100)}%</Badge> : null}</>}</td>
                <td className="px-2">{fmtDateTime(l.updatedAt)}</td><td className="px-2 text-right"><Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void put(l.kind, l.key, null, "Limit removed")}>Remove</Button></td></tr>
            })}</tbody></table></div>
        ))}
        <form className="grid gap-3 sm:grid-cols-[1fr_1fr_8rem_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); if (value !== "" && !valueBad && !keyBad) void put(kind, key, n, "Limit saved") }}>
          <label className="flex flex-col gap-1"><span className="text-xs text-muted-foreground">Applies to</span>
            <select aria-label="Limit applies to" className="h-9 rounded-md border bg-background px-2 text-sm" value={kind} onChange={(e) => pick(e.target.value as Limit["kind"])}>{(Object.keys(KIND_LABEL) as Limit["kind"][]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-muted-foreground">{kind === "COLLEGE" ? "Institution" : kind === "PROVIDER" ? "Provider" : kind === "PURPOSE" ? "Purpose" : "Scope"}</span>
            {kind === "COLLEGE" ? (
              <select aria-label="Institution" className="h-9 rounded-md border bg-background px-2 text-sm" value={key} onChange={(e) => setKey(e.target.value)}><option value="">Choose an institution…</option>{colleges.filter((c) => c.collegeKey !== "platform").map((c) => <option key={c.collegeKey} value={c.collegeKey}>{c.name}</option>)}</select>
            ) : kind === "COLLEGE_DEFAULT" ? <Input aria-label="Scope" value="All institutions" disabled /> : (
              <select aria-label={kind === "PROVIDER" ? "Provider" : "Purpose"} className="h-9 rounded-md border bg-background px-2 text-sm" value={key} onChange={(e) => setKey(e.target.value)}>{(kind === "PROVIDER" ? ["GROQ", "ANTHROPIC"] : ["TEXT", "VISION", "INTERVIEW"]).map((o) => <option key={o} value={o}>{o}</option>)}</select>
            )}</label>
          <label className="flex flex-col gap-1"><span className="text-xs text-muted-foreground">Calls per day</span><Input aria-label="Calls per day" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.trim())} aria-invalid={valueBad} placeholder="e.g. 500" /></label>
          <Button type="submit" disabled={!!busy || value === "" || valueBad || keyBad}>{busy && <Spinner />}Set limit</Button>
        </form>
        {valueBad && <p className="text-xs text-destructive" data-testid="ai-limit-invalid">Enter a whole number from 0 to {num(max)}.</p>}
        {kind === "COLLEGE" && key === "" && <p className="text-xs text-muted-foreground">Institutions appear here once they have used AI. To limit every institution, use the default.</p>}
        {err && <Alert variant="destructive" role="alert" data-testid="ai-limit-error"><AlertTitle>Not saved</AlertTitle><AlertDescription>{err}</AlertDescription></Alert>}
      </CardContent>
    </Card>
  )
}

/** Usage and limits for the platform administrator. Counts and times only: no prompt, answer, student or document is ever shown, because none is ever stored. */
export function UsagePanel() {
  const [days, setDays] = React.useState(7)
  const [page, setPage] = React.useState(1)
  const { data, error, loading, reload } = useApi<Usage>(`/api/platform/ai/usage?days=${days}&page=${page}`)
  const near = (data?.today ?? []).filter((t) => t.limit !== null && t.limit > 0 && t.used / t.limit >= 0.8)
  const maxCalls = Math.max(1, ...(data?.trend ?? []).map((t) => t.calls + t.blocked))
  const pages = data ? Math.max(1, Math.ceil(data.colleges.total / data.colleges.pageSize)) : 1
  return (
    <section className="flex flex-col gap-4" data-testid="ai-usage" aria-label="AI usage and limits">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h2 className="text-lg font-semibold tracking-tight">Usage and limits</h2><p className="text-sm text-muted-foreground">How much AI was used, by whom and for what. Only counts and times are kept (for 90 days): never a prompt, an answer or a student.</p></div>
        <label className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">Period</span>
          <select aria-label="Usage period" className="h-9 rounded-md border bg-background px-2 text-sm" value={days} onChange={(e) => { setDays(Number(e.target.value)); setPage(1) }}><option value={1}>Today</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label>
      </div>
      {!!error && !data && <Alert variant="destructive" role="alert" data-testid="ai-usage-error"><AlertTitle>Could not load the usage</AlertTitle><AlertDescription>{errText(error)} <Button size="sm" variant="outline" className="ml-2" onClick={reload}>Retry</Button></AlertDescription></Alert>}
      {!!error && !!data && <Alert role="alert"><AlertTitle>Showing the last loaded usage</AlertTitle><AlertDescription>The refresh failed: {errText(error)}</AlertDescription></Alert>}
      {loading && !data && <Skeleton className="h-40" />}
      {data && (
        <>
          {near.length > 0 && <Alert role="status" data-testid="ai-limit-warnings"><AlertTitle>Daily limits nearly or fully used</AlertTitle><AlertDescription><ul className="list-disc pl-4">{near.map((t) => <li key={t.scope}>{t.kind === "college" ? `Institution ${data.colleges.rows.find((c) => c.collegeKey === t.key)?.name ?? t.key.slice(0, 8)}` : `${t.kind === "provider" ? "Provider" : "Purpose"} ${t.key}`}: {num(t.used)} of {num(t.limit!)} today{t.used >= t.limit! ? " (reached)" : ""}</li>)}</ul></AlertDescription></Alert>}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat id="ai-stat-calls" label="Calls" value={num(data.totals.calls)} />
            <Stat id="ai-stat-failed" label="Failed" value={num(data.totals.failures + data.totals.timeouts)} tone={data.totals.failures + data.totals.timeouts > 0 ? "bad" : undefined} />
            <Stat id="ai-stat-ratelimited" label="Rate limited by provider" value={num(data.totals.rateLimited)} />
            <Stat id="ai-stat-blocked" label="Refused by a daily limit" value={num(data.totals.blocked)} />
            <Stat id="ai-stat-avg" label="Average time" value={data.totals.avgMs === null ? "—" : `${num(data.totals.avgMs)} ms`} />
          </div>
          {data.totals.calls === 0 && data.totals.blocked === 0 && <p className="text-sm text-muted-foreground" data-testid="ai-usage-empty">No AI calls were recorded in this period.</p>}
          <Card><CardHeader><CardTitle className="text-base">Daily trend</CardTitle></CardHeader><CardContent>
            {data.trend.length === 0 ? <p className="text-xs text-muted-foreground">Nothing recorded yet.</p> : (
              <ul className="flex flex-col gap-1" data-testid="ai-trend">{data.trend.map((d) => <li key={d.day} className="flex items-center gap-2 text-xs"><span className="w-20 shrink-0 text-muted-foreground">{d.day}</span><span className="h-2 rounded bg-primary" style={{ width: `${Math.max(2, (d.calls / maxCalls) * 100)}%` }} aria-hidden /><span>{num(d.calls)}{d.failures ? `, ${num(d.failures)} failed` : ""}{d.blocked ? `, ${num(d.blocked)} refused` : ""}</span></li>)}</ul>
            )}</CardContent></Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardContent className="pt-6"><Table id="ai-by-purpose" title="By purpose" rows={data.byPurpose} /></CardContent></Card>
            <Card><CardContent className="pt-6"><Table id="ai-by-provider" title="By provider" rows={data.byProvider} /></CardContent></Card>
            <Card><CardContent className="pt-6"><Table id="ai-by-model" title="By model" rows={data.byModel} /></CardContent></Card>
            <Card><CardContent className="pt-6"><Table id="ai-by-feature" title="By feature" rows={data.byFeature} /></CardContent></Card>
          </div>
          <Card data-testid="ai-by-college"><CardHeader><CardTitle className="text-base">By institution</CardTitle><CardDescription>Busiest first. “Platform” is AI work not made for one institution.</CardDescription></CardHeader><CardContent>
            {data.colleges.rows.length === 0 ? <p className="text-xs text-muted-foreground">No institution has used AI in this period.</p> : (
              <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-muted-foreground"><tr><th className="py-1 pr-3 font-normal">Institution</th><th className="px-2 font-normal">Calls</th><th className="px-2 font-normal">Failed</th><th className="px-2 font-normal">Refused by limit</th><th className="px-2 font-normal">Avg ms</th></tr></thead>
                <tbody>{data.colleges.rows.map((r) => <tr key={r.collegeKey} className="border-t"><td className="py-1 pr-3 font-medium">{r.name}</td><td className="px-2">{num(r.calls)}</td><td className="px-2">{num(r.failures)}</td><td className="px-2">{num(r.blocked)}</td><td className="px-2">{r.avgMs ?? "—"}</td></tr>)}</tbody></table></div>
            )}
            {pages > 1 && <div className="mt-3 flex items-center gap-2 text-xs"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><span data-testid="ai-college-page">Page {page} of {pages}</span><Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button></div>}
          </CardContent></Card>
          <LimitsEditor today={data.today} colleges={data.colleges.rows} />
        </>
      )}
    </section>
  )
}
