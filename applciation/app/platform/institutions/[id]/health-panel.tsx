"use client"

import * as React from "react"
import { CheckCircle2Icon, CircleDashedIcon, TriangleAlertIcon, InfoIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { useApi } from "@/lib/web/use-api"

type Props = {
  id: string
  firstAdministrator: { isActive: boolean } | null
  counts: { students: number; departments: number; programs: number; batches: number }
  modules: { enabled: boolean }[]
  lastActivity: string | null
}
type Usage = { snapshot: { documents: number; storageBytes: number }; activity: { distinctSignedInUsers: number; signIns: number; ai: { calls: number; failures: number; blocked: number } } }
type Count = { total: number }
const bytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`)

/**
 * Setup progress and health for one institution. Nothing here is a score someone made up: the setup list follows what provisioning actually creates, and
 * every health indicator shows the rule it is judged by. "Needs attention" is a prompt to look, not a verdict. No student or staff records are used, only counts.
 */
export function HealthPanel({ id, firstAdministrator, counts, modules, lastActivity }: Props) {
  const usage = useApi<Usage>(`/api/platform/institutions/${id}/usage`)
  const open = useApi<Count>("/api/platform/support", { institution: id, status: "OPEN", pageSize: 1 })
  const prog = useApi<Count>("/api/platform/support", { institution: id, status: "IN_PROGRESS", pageSize: 1 })

  const steps = [
    { label: "Institution created", done: true },
    { label: "First administrator assigned", done: !!firstAdministrator },
    { label: "Administrator account is active", done: !!firstAdministrator?.isActive },
    { label: "Departments added", done: counts.departments > 0 },
    { label: "Programmes and batches set up", done: counts.programs > 0 && counts.batches > 0 },
    { label: "Students added", done: counts.students > 0 },
    { label: "At least one module switched on", done: modules.some((m) => m.enabled) },
    { label: "Someone has signed in", done: lastActivity !== null },
  ]
  const doneCount = steps.filter((s) => s.done).length

  type Indicator = { name: string; state: "good" | "attention" | "info" | "loading"; value: string; rule: string }
  const u = usage.data
  const pending = open.data && prog.data ? open.data.total + prog.data.total : null
  const on = modules.filter((m) => m.enabled).length
  const indicators: Indicator[] = [
    { name: "Setup completeness", state: doneCount === steps.length ? "good" : "attention", value: `${doneCount} of ${steps.length} steps done`, rule: "Good when every step in the setup list is done." },
    { name: "User activity", state: !u ? (usage.error ? "info" : "loading") : u.activity.distinctSignedInUsers > 0 ? "good" : "attention", value: !u ? (usage.error ? "Unavailable" : "") : `${u.activity.signIns} sign-ins by ${u.activity.distinctSignedInUsers} people`, rule: "Last 30 days. Good when at least one person signed in." },
    { name: "Module adoption", state: "info", value: `${on} of ${modules.length} modules on`, rule: "For information. Switching modules on or off is a choice, not a fault." },
    { name: "Storage", state: !u ? (usage.error ? "info" : "loading") : "info", value: u ? `${bytes(u.snapshot.storageBytes)} in ${u.snapshot.documents} documents` : usage.error ? "Unavailable" : "", rule: "For information. No storage limit is defined for institutions." },
    { name: "AI use", state: !u ? (usage.error ? "info" : "loading") : u.activity.ai.blocked > 0 || u.activity.ai.failures > 0 ? "attention" : "good", value: u ? `${u.activity.ai.calls} calls, ${u.activity.ai.failures} failed, ${u.activity.ai.blocked} blocked` : usage.error ? "Unavailable" : "", rule: "Last 30 days. Needs attention if any call failed or was blocked." },
    { name: "Support requests", state: pending === null ? (open.error || prog.error ? "info" : "loading") : pending > 0 ? "attention" : "good", value: pending === null ? (open.error || prog.error ? "Unavailable" : "") : pending === 0 ? "None waiting" : `${pending} waiting`, rule: "Needs attention while any request is open or in progress." },
  ]
  const attention = indicators.filter((i) => i.state === "attention").length
  const icon = (s: Indicator["state"]) => s === "good" ? <CheckCircle2Icon className="size-4 text-primary" /> : s === "attention" ? <TriangleAlertIcon className="size-4 text-amber-600" /> : <InfoIcon className="size-4 text-muted-foreground" />

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Setup progress</CardTitle><CardDescription>The steps provisioning an institution involves, checked against what exists now.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-3"><Progress value={(doneCount / steps.length) * 100} aria-label="Setup progress" className="flex-1" /><span className="text-sm tabular-nums text-muted-foreground">{doneCount}/{steps.length}</span></div>
          <ul className="flex flex-col gap-2 text-sm">
            {steps.map((s) => <li key={s.label} className="flex items-center gap-2">{s.done ? <CheckCircle2Icon className="size-4 text-primary" /> : <CircleDashedIcon className="size-4 text-muted-foreground" />}<span className={s.done ? "" : "text-muted-foreground"}>{s.label}</span></li>)}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">Health<Badge variant={attention ? "outline" : "default"} className={attention ? "border-amber-500 bg-amber-100 text-amber-900" : ""}>{attention ? `${attention} need${attention === 1 ? "s" : ""} attention` : "Nothing needs attention"}</Badge></CardTitle>
          <CardDescription>Each indicator shows the rule it is judged by. There is no overall score.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col divide-y">
            {indicators.map((i) => (
              <li key={i.name} className="flex items-start gap-3 py-2.5 text-sm">
                <span className="mt-0.5">{i.state === "loading" ? <Skeleton className="size-4 rounded-full" /> : icon(i.state)}</span>
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline justify-between gap-x-3"><span className="font-medium">{i.name}</span><span className="text-muted-foreground">{i.state === "loading" ? <Skeleton className="h-4 w-24" /> : i.value}</span></div><div className="text-xs text-muted-foreground">{i.rule}</div></div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
