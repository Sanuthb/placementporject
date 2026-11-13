"use client"

import * as React from "react"
import { InfoIcon } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { fmtDateTime } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"
import { PageHeader } from "../_components/page-header"

type Link = { module: string; label: string }
type Setting = {
  module: string; label: string; description: string; globallyEnabled: boolean; reason: string | null; updatedAt: string | null
  availableFrom: string | null; rolloutPercent: number; status: "off" | "scheduled" | "rollout" | "on"; reachedInstitutions: number | null; activeInstitutions: number
  dependsOn: Link[]; dependents: Link[]
}
type Adoption = { activeInstitutions: number; items: { module: string; enabled: number; total: number; share: number | null }[] }

/** A value for <input type="datetime-local"> in the viewer's own time zone. */
const local = (iso: string | null) => { if (!iso) return ""; const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` }

function StatusBadge({ m }: { m: Setting }) {
  if (m.status === "off") return <Badge variant="destructive">Off for everyone</Badge>
  if (m.status === "scheduled") return <Badge variant="secondary">Launches {m.availableFrom ? fmtDateTime(m.availableFrom) : "later"}</Badge>
  if (m.status === "rollout") return <Badge variant="outline" className="border-amber-500 bg-amber-100 text-amber-900">Rolling out: {m.rolloutPercent}%</Badge>
  return null
}

/**
 * Module management. Each institution switches modules on for itself (on its own page). The platform adds three controls here, and all of them can only REDUCE who gets a module:
 * an emergency off-switch, a launch time, and a gradual rollout. None of them turns anything on for an institution or gives anyone a permission.
 * "Works together with" is advice only; the server does not enforce it.
 */
export default function ModulesPage() {
  const settings = useApi<{ items: Setting[] }>("/api/platform/modules")
  const adoption = useApi<Adoption>("/api/platform/analytics/modules")
  const [edit, setEdit] = React.useState<Setting | null>(null)
  const adopt = (m: string) => adoption.data?.items.find((a) => a.module === m)

  return (
    <>
      <PageHeader title="Module management" description="Which parts of the platform are available, and how they are released. Institutions choose their own modules; the controls here are for emergencies, launches and gradual rollouts." />
      <Alert><InfoIcon /><AlertTitle>How the controls work</AlertTitle><AlertDescription>An institution has a module on or off for itself (open the institution and choose Modules). The platform controls here can only take availability away: switch a module off for everyone, hold it until a launch time, or release it to a share of institutions first. Raising a rollout only adds institutions; those already included stay included. None of this turns a module on for an institution or gives anyone extra permissions.</AlertDescription></Alert>

      {settings.error ? <Alert variant="destructive"><AlertTitle>Could not load modules</AlertTitle><AlertDescription className="flex flex-col items-start gap-2">{settings.error instanceof Error ? settings.error.message : "Try again"}<Button size="sm" variant="outline" onClick={settings.reload}>Try again</Button></AlertDescription></Alert>
        : !settings.data ? <Skeleton className="h-64 w-full rounded-xl" /> : (
          <ul className="grid gap-3 md:grid-cols-2" aria-label="Modules">
            {settings.data.items.map((m) => {
              const a = adopt(m.module)
              return (
                <li key={m.module} className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{m.label}</span><StatusBadge m={m} /></div><p className="mt-0.5 text-sm text-muted-foreground">{m.description}</p></div>
                    <Button size="sm" variant="outline" onClick={() => setEdit(m)}>Manage</Button>
                  </div>
                  {a && adoption.data && adoption.data.activeInstitutions > 0 ? (
                    <div className="flex flex-col gap-1"><div className="flex justify-between text-xs text-muted-foreground"><span>Switched on by institutions</span><span className="tabular-nums">{a.enabled} of {a.total}</span></div><Progress value={a.share ?? 0} aria-label={`${m.label} adoption`} /></div>
                  ) : adoption.error ? <p className="text-xs text-muted-foreground">Adoption is unavailable right now.</p> : null}
                  {m.status === "rollout" && m.reachedInstitutions !== null && <p className="text-xs text-muted-foreground">Released to {m.reachedInstitutions} of {m.activeInstitutions} active institutions so far.</p>}
                  {m.status === "off" && <p className="text-xs text-muted-foreground">Switched off{m.updatedAt ? ` ${fmtDateTime(m.updatedAt)}` : ""}{m.reason ? `: ${m.reason}` : ""}. Requests to it are refused with a message that it is temporarily switched off.</p>}
                  {m.dependsOn.length > 0 && <p className="text-xs text-muted-foreground">Works together with: {m.dependsOn.map((d) => d.label).join(", ")}.</p>}
                </li>
              )
            })}
          </ul>
        )}

      <Dialog open={!!edit} onOpenChange={(o) => { if (!o) setEdit(null) }}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>{edit?.label}</DialogTitle><DialogDescription>Platform-wide availability. Every change is recorded in the audit log.</DialogDescription></DialogHeader>
          {edit && <ManageForm key={edit.module} m={edit} all={settings.data?.items ?? []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); settings.reload() }} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

function ManageForm({ m, all, onClose, onSaved }: { m: Setting; all: Setting[]; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = React.useState({ enabled: m.globallyEnabled, reason: m.reason ?? "", from: local(m.availableFrom), percent: String(m.rolloutPercent) })
  const [busy, setBusy] = React.useState(false)
  const pct = Number(v.percent)
  const pctOk = v.percent !== "" && Number.isInteger(pct) && pct >= 0 && pct <= 100
  const turningOff = !v.enabled && m.globallyEnabled
  const offDeps = m.dependsOn.filter((d) => all.find((x) => x.module === d.module)?.status === "off")

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    try {
      await api(`/api/platform/modules/${m.module}`, { method: "PUT", body: { enabled: v.enabled, ...(!v.enabled ? { reason: v.reason.trim() } : {}), availableFrom: v.from ? new Date(v.from).toISOString() : null, rolloutPercent: pct } })
      toast.success(`${m.label} updated`); onSaved()
    } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <FieldGroup>
        <Field><div className="flex items-center justify-between gap-3"><FieldLabel htmlFor="mod-on">Available platform-wide</FieldLabel><Switch id="mod-on" checked={v.enabled} onCheckedChange={(c) => setV({ ...v, enabled: c })} /></div><FieldDescription>Switching it off removes the module for every institution until you switch it back on. Their data is kept.</FieldDescription></Field>
        {!v.enabled && <Field><FieldLabel htmlFor="mod-reason">Why is it being switched off</FieldLabel><Textarea id="mod-reason" rows={2} maxLength={300} value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} /></Field>}
        {v.enabled && (
          <>
            <Field><FieldLabel htmlFor="mod-from">Available from (optional)</FieldLabel><Input id="mod-from" type="datetime-local" value={v.from} onChange={(e) => setV({ ...v, from: e.target.value })} /><FieldDescription>Until this time nobody can use the module. Leave empty for no launch time.</FieldDescription></Field>
            <Field><FieldLabel htmlFor="mod-pct">Share of institutions it is released to</FieldLabel><div className="flex items-center gap-2"><Input id="mod-pct" type="number" min={0} max={100} step={1} className="w-24" value={v.percent} onChange={(e) => setV({ ...v, percent: e.target.value })} /><span className="text-sm text-muted-foreground">percent</span></div><FieldDescription>100 means everyone. Institutions are picked by a fixed rule, so the same ones stay in as you raise the number.</FieldDescription></Field>
          </>
        )}
      </FieldGroup>
      {turningOff && m.dependents.length > 0 && <Alert><InfoIcon /><AlertTitle>Other modules usually rely on this one</AlertTitle><AlertDescription>{m.dependents.map((d) => d.label).join(", ")} normally work together with {m.label}. They are not switched off automatically, but they may not be useful without it.</AlertDescription></Alert>}
      {offDeps.length > 0 && v.enabled && <Alert><InfoIcon /><AlertTitle>A module this one works with is off</AlertTitle><AlertDescription>{offDeps.map((d) => d.label).join(", ")} is switched off for everyone, so {m.label} may not be useful yet.</AlertDescription></Alert>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" variant={turningOff ? "destructive" : "default"} disabled={busy || !pctOk || (!v.enabled && v.reason.trim().length < 3)}>{busy && <Spinner />}{turningOff ? "Switch off for everyone" : "Save"}</Button></div>
    </form>
  )
}
