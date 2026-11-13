"use client"

import * as React from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { api, ApiClientError, toastError } from "@/lib/web/api"
import { fmtDateTime } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"
import { denied } from "../_components/denied"

type Item = { key: string; label: string; days: number; defaultDays: number; min: number; max: number; source: string; rowsOutsidePeriod: number }
type Data = { mfa: { requireForInstitutionAdmins: boolean; activeInstitutionAdministrators: number; activeInstitutions: number; institutionsAlreadyRequiring: number; updatedAt: string | null }; retention: { items: Item[]; note: string } }
const FIELD: Record<string, string> = { jobRun: "jobRunDays", monitorEvent: "monitorEventDays", aiUsage: "aiUsageDays" }

/** Security and retention policy. The API validates every value, enforces the ranges and asks for confirmation before anything that would delete records. */
export default function PolicyPage() {
  const { data, error, loading, reload } = useApi<Data>("/api/platform/policy")
  const d = denied(error); if (d) return d
  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex items-start justify-between gap-3">
        <div><h1 className="text-2xl font-semibold tracking-tight">Security and retention policy</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Platform-wide settings. Every change is recorded in the audit log.</p></div>
        </header>
      {error ? <Alert variant="destructive"><AlertTitle>Could not load</AlertTitle><AlertDescription>{error instanceof Error ? error.message : "Try again"}</AlertDescription></Alert> : loading && !data ? <Skeleton className="h-64 w-full" /> : data && <Body key={JSON.stringify(data.retention.items.map((i) => i.days)) + data.mfa.requireForInstitutionAdmins} data={data} reload={reload} />}
    </div>
  )
}

function Body({ data, reload }: { data: Data; reload: () => void }) {
  const [busy, setBusy] = React.useState(false)
  const [vals, setVals] = React.useState<Record<string, string>>(Object.fromEntries(data.retention.items.map((i) => [i.key, String(i.days)])))
  const [confirm, setConfirm] = React.useState<{ wouldDelete: Record<string, number> } | null>(null)
  const [ran, setRan] = React.useState<string | null>(null)
  const run = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); try { await fn(); toast.success(ok); reload() } catch (e) { toastError(e) } finally { setBusy(false) } }
  const body = () => Object.fromEntries(data.retention.items.filter((i) => vals[i.key] !== String(i.days)).map((i) => [FIELD[i.key], vals[i.key] === "" ? null : Number(vals[i.key])]))
  const save = async (confirmed: boolean) => {
    setBusy(true)
    try { await api("/api/platform/policy/retention", { method: "PUT", body: { ...body(), ...(confirmed ? { confirm: true } : {}) } }); toast.success("Retention saved"); setConfirm(null); reload() }
    catch (e) { if (e instanceof ApiClientError && e.code === "CONFIRMATION_REQUIRED") setConfirm({ wouldDelete: (e.details as { wouldDelete: Record<string, number> }).wouldDelete }); else toastError(e) }
    finally { setBusy(false) }
  }
  const m = data.mfa
  return (
    <>
      <Card><CardHeader><CardTitle>Two-step sign-in for institution administrators</CardTitle><CardDescription>Platform administrators always need it. This sets the minimum for institution administrators: an institution can be stricter, never weaker.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex items-center gap-2">Platform minimum: <Badge data-testid="mfa-state" variant={m.requireForInstitutionAdmins ? "default" : "secondary"}>{m.requireForInstitutionAdmins ? "Required" : "Not required"}</Badge></div>
          <p className="text-muted-foreground">{m.activeInstitutionAdministrators} active institution administrators in {m.activeInstitutions} institutions; {m.institutionsAlreadyRequiring} institutions already require it themselves. When this is on, an administrator without an authenticator is asked to set one up at their next request.</p>
          <div><Button disabled={busy} onClick={() => run(() => api("/api/platform/policy/mfa", { method: "PUT", body: { required: !m.requireForInstitutionAdmins } }), m.requireForInstitutionAdmins ? "Minimum switched off" : "Minimum switched on")}>{m.requireForInstitutionAdmins ? "Switch minimum off" : "Require for all institutions"}</Button></div>
        </CardContent></Card>

      <Card><CardHeader><CardTitle>Retention of operational records</CardTitle><CardDescription>{data.retention.note}</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3">
          {data.retention.items.map((i) => (
            <div key={i.key} className="flex flex-wrap items-center justify-between gap-2 text-sm" data-testid={`ret-${i.key}`}>
              <div>{i.label}<div className="text-xs text-muted-foreground">Allowed {i.min}–{i.max} days · default {i.defaultDays} · {i.source} · {i.rowsOutsidePeriod} record(s) older than the period</div></div>
              <div className="flex items-center gap-2"><Input aria-label={`${i.label} days`} type="number" className="w-24" value={vals[i.key]} onChange={(e) => setVals({ ...vals, [i.key]: e.target.value })} /><span>days</span></div>
            </div>
          ))}
          {confirm && <Alert variant="destructive" data-testid="confirm"><AlertTitle>This will permanently delete records</AlertTitle><AlertDescription>The next cleanup removes: {Object.entries(confirm.wouldDelete).map(([k, n]) => `${n} ${k} record(s)`).join(", ")}. This cannot be undone.<div className="mt-2 flex gap-2"><Button size="sm" variant="destructive" disabled={busy} onClick={() => save(true)}>Confirm and save</Button><Button size="sm" variant="outline" onClick={() => { setConfirm(null); setVals(Object.fromEntries(data.retention.items.map((i) => [i.key, String(i.days)]))) }}>Cancel</Button></div></AlertDescription></Alert>}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || confirm !== null} onClick={() => save(false)}>Save retention</Button>
            <Button variant="outline" disabled={busy} onClick={async () => { setBusy(true); try { const r = await api<{ jobRuns: number; monitorEvents: number; aiUsageDays: number; capped: boolean }>("/api/platform/policy/retention/run", { method: "POST" }); setRan(`Removed ${r.jobRuns} job record(s), ${r.monitorEvents} monitoring event(s), ${r.aiUsageDays} AI usage row(s)${r.capped ? "; more remain for the next run" : ""}.`); reload() } catch (e) { toastError(e) } finally { setBusy(false) } }}>Run cleanup now</Button>
          </div>
          {ran && <p className="text-sm" data-testid="ran">{ran} {fmtDateTime(new Date().toISOString())}</p>}
          <p className="text-xs text-muted-foreground">The cleanup also runs hourly. It removes a limited number of records per run and is written to the audit log.</p>
        </CardContent></Card>
    </>
  )
}
