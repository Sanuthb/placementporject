"use client"

import * as React from "react"
import { toast } from "sonner"

import { MasterTab } from "@/components/master-tab"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api, download, toastError } from "@/lib/web/api"
import { fmtDate, titleCase } from "@/lib/web/format"
import { useAuth } from "@/lib/web/auth"

type Sched = { id: string; type: string; frequency: string; recipients: string[]; isActive: boolean; nextRunAt?: string | null }
type Import = { created?: number; skipped?: number; failed?: number; errors?: unknown[]; [k: string]: unknown }

export default function ReportsPage() {
  const { state } = useAuth()
  const hasOnboarding = state.status === "ready" && state.profile.modules.includes("ONBOARDING")
  return (
    <Tabs defaultValue="download">
      <TabsList><TabsTrigger value="download">Reports</TabsTrigger><TabsTrigger value="schedules">Scheduled emails</TabsTrigger>{hasOnboarding && <TabsTrigger value="history">Past placements</TabsTrigger>}</TabsList>
      <TabsContent value="download" className="grid max-w-3xl gap-4 sm:grid-cols-2">
        <Card><CardHeader><CardTitle>Placement report</CardTitle><CardDescription>A PDF summary for management.</CardDescription></CardHeader><CardContent><Button onClick={() => download("/api/reports/placement.pdf").catch(toastError)}>Download PDF</Button></CardContent></Card>
        <Card><CardHeader><CardTitle>NIRF-style data</CardTitle><CardDescription>Placement data in a NAAC/NIRF layout, as Excel.</CardDescription></CardHeader><CardContent><Button onClick={() => download("/api/reports/nirf").catch(toastError)}>Download Excel</Button></CardContent></Card>
      </TabsContent>
      <TabsContent value="schedules">
        <MasterTab<Sched> endpoint="/api/reports/schedules" addLabel="Schedule a report"
          fields={[{ name: "type", label: "Report", type: "select", required: true, options: [{ value: "PLACEMENT_SUMMARY", label: "Placement summary (PDF)" }, { value: "NIRF", label: "NIRF data (Excel)" }] }, { name: "frequency", label: "How often", type: "select", required: true, options: [{ value: "WEEKLY", label: "Weekly" }, { value: "MONTHLY", label: "Monthly" }] }, { name: "recipients", label: "Send to (emails, separated by commas)" }]}
          toBody={(v) => ({ type: v.type, frequency: v.frequency, recipients: String(v.recipients).split(",").map((s) => s.trim()).filter(Boolean) })}
          patchPath={(r) => `/api/reports/schedules/${r.id}`}
          columns={[{ label: "Report", cell: (r) => titleCase(r.type) }, { label: "Frequency", cell: (r) => titleCase(r.frequency) }, { label: "Recipients", cell: (r) => r.recipients.join(", ") }, { label: "Next run", cell: (r) => fmtDate(r.nextRunAt) }, { label: "State", cell: (r) => <Badge variant={r.isActive ? "default" : "outline"}>{r.isActive ? "On" : "Off"}</Badge> }]} />
      </TabsContent>
      {hasOnboarding && <TabsContent value="history"><HistoricalImport /></TabsContent>}
    </Tabs>
  )
}

function HistoricalImport() {
  const [dry, setDry] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [res, setRes] = React.useState<Import | null>(null)
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const body = new FormData(e.currentTarget)
    setBusy(true)
    try { setRes(await api<Import>(`/api/placements/historical-import${dry ? "?dryRun=true" : ""}`, { method: "POST", body })); toast.success(dry ? "Checked. Nothing was saved." : "Import finished") } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>Import past placement records</CardTitle><CardDescription>Students, companies, offers and packages from earlier years, kept apart from the current season so analytics are useful from day one.</CardDescription></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field><FieldLabel htmlFor="file">Spreadsheet</FieldLabel><Input id="file" name="file" type="file" accept=".xlsx,.csv" required /><FieldDescription>Columns: enrollment_no, name, email, department_code, batch_name, company_name, company_tier, role, package_lpa, offer_year, joined.</FieldDescription></Field>
          <label className="flex items-center gap-2 text-sm"><Switch checked={dry} onCheckedChange={setDry} />Check only (nothing is saved)</label>
          <div><Button type="submit" disabled={busy}>{busy && <Spinner />}{dry ? "Check file" : "Import"}</Button></div>
        </form>
        {res && <Alert className="mt-4"><AlertTitle>Result</AlertTitle><AlertDescription><pre className="whitespace-pre-wrap text-xs">{JSON.stringify(res, null, 2).slice(0, 1500)}</pre></AlertDescription></Alert>}
      </CardContent>
    </Card>
  )
}
