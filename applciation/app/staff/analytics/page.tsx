"use client"

import * as React from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { OptionSelect } from "@/components/option-select"
import { EliminationStudents } from "@/components/staff-extras"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { download, toastError } from "@/lib/web/api"
import { fmtLpa, titleCase } from "@/lib/web/format"
import { useLookups } from "@/lib/web/lookups"
import { useApi } from "@/lib/web/use-api"

type Row = { id: string; name: string; total: number; placed: number; percentage: number }
type Overview = {
  placement: { placed: number; total: number; percentage: number }
  byDepartment: Row[]; byBatch: Row[]
  packages: { highest?: number | null; average?: number | null; median?: number | null }
  companies: { visited: number }
  offers: { made: number; accepted: number; declined: number; revoked: number; pending: number }
}
type Elim = {
  totalEliminations: number; mostCommonStopRound: string | null
  byRoundType: { roundType: string; count: number; percentage: number }[]
  repeatFailures: { studentId: string; name: string; enrollmentNo: string; roundType: string; times: number }[]
}
type Funnel = { funnel: { stage: string; count: number }[]; absentees: { studentId: string; name: string; enrollmentNo: string; excused: boolean }[] }

const cfg = { count: { label: "Students", color: "var(--chart-2)" } } satisfies ChartConfig

export default function AnalyticsPage() {
  const lk = useLookups()
  const [dept, setDept] = React.useState("")
  const [batch, setBatch] = React.useState("")
  const [driveId, setDriveId] = React.useState("")
  const ov = useApi<Overview>("/api/analytics/overview", { departmentId: dept, batchId: batch })
  const el = useApi<Elim>("/api/analytics/elimination", { departmentId: dept, batchId: batch })
  const drives = useApi<{ items: { id: string; role: string; company: { name: string } }[] }>("/api/drives", { limit: 100 })
  const fn = useApi<Funnel>(driveId ? `/api/analytics/drives/${driveId}` : null)

  const filters = (
    <div className="flex flex-wrap items-center gap-2">
      <OptionSelect className="w-44" value={dept} onChange={setDept} options={[{ value: "", label: "All departments" }, ...lk.departments]} placeholder="Department" />
      <OptionSelect className="w-40" value={batch} onChange={setBatch} options={[{ value: "", label: "All batches" }, ...lk.batches]} placeholder="Batch" />
      <Button variant="outline" className="ml-auto" onClick={() => download("/api/analytics/overview", { query: { departmentId: dept, batchId: batch, format: "xlsx" } }).catch(toastError)}>Export to Excel</Button>
    </div>
  )
  const tbl = (rows: Row[], label: string) => (
    <Table>
      <TableHeader><TableRow><TableHead>{label}</TableHead><TableHead className="text-right">Placed</TableHead><TableHead className="w-48">Progress</TableHead></TableRow></TableHeader>
      <TableBody>{rows.map((r) => <TableRow key={r.id}><TableCell>{r.name}</TableCell><TableCell className="text-right">{r.placed}/{r.total}</TableCell><TableCell><Progress value={r.percentage} /></TableCell></TableRow>)}</TableBody>
    </Table>
  )

  return (
    <Tabs defaultValue="overview">
      <TabsList><TabsTrigger value="overview">Placement overview</TabsTrigger><TabsTrigger value="drive">Drive funnel</TabsTrigger><TabsTrigger value="elimination">Elimination</TabsTrigger></TabsList>

      <TabsContent value="overview" className="flex flex-col gap-4">
        {filters}
        {!ov.data ? <Skeleton className="h-64" /> : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[["Placed", `${ov.data.placement.placed} of ${ov.data.placement.total} (${ov.data.placement.percentage}%)`], ["Highest package", fmtLpa(ov.data.packages.highest)], ["Average / median", `${fmtLpa(ov.data.packages.average)} / ${fmtLpa(ov.data.packages.median)}`], ["Companies visited", ov.data.companies.visited]].map(([l, v]) => (
                <Card key={String(l)} size="sm"><CardHeader><CardDescription>{l}</CardDescription><CardTitle className="text-xl">{v}</CardTitle></CardHeader></Card>
              ))}
            </div>
            <Card size="sm"><CardContent className="text-sm">Offers: {ov.data.offers.made} made, {ov.data.offers.accepted} accepted, {ov.data.offers.declined} declined, {ov.data.offers.revoked} revoked, {ov.data.offers.pending} pending.</CardContent></Card>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card><CardHeader><CardTitle>By department</CardTitle></CardHeader><CardContent>{tbl(ov.data.byDepartment, "Department")}</CardContent></Card>
              <Card><CardHeader><CardTitle>By batch</CardTitle></CardHeader><CardContent>{tbl(ov.data.byBatch, "Batch")}</CardContent></Card>
            </div>
          </>
        )}
      </TabsContent>

      <TabsContent value="drive" className="flex flex-col gap-4">
        <OptionSelect className="w-80" value={driveId} onChange={setDriveId} options={(drives.data?.items ?? []).map((d) => ({ value: d.id, label: `${d.company.name}: ${d.role}` }))} placeholder="Choose a drive" />
        {fn.data && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Funnel</CardTitle></CardHeader>
              <CardContent>
                <ChartContainer config={cfg} className="h-64 w-full">
                  <BarChart data={fn.data.funnel} layout="vertical" margin={{ left: 40 }}>
                    <CartesianGrid horizontal={false} />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="stage" width={150} tick={{ fontSize: 11 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" fill="var(--color-count)" radius={4} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Applied but did not attend</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-1 text-sm">
                {fn.data.absentees.map((a) => <div key={a.studentId} className="flex justify-between"><span>{a.name} <span className="text-muted-foreground">{a.enrollmentNo}</span></span>{a.excused && <span className="text-muted-foreground">excused</span>}</div>)}
                {fn.data.absentees.length === 0 && <span className="text-muted-foreground">Everyone who applied attended.</span>}
              </CardContent>
            </Card>
          </div>
        )}
      </TabsContent>

      <TabsContent value="elimination" className="flex flex-col gap-4">
        {filters}
        {!el.data ? <Skeleton className="h-64" /> : (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Where students stop</CardTitle><CardDescription>{el.data.mostCommonStopRound ? `Most often: ${titleCase(el.data.mostCommonStopRound)} (${el.data.totalEliminations} eliminations)` : "No eliminations recorded yet"}</CardDescription></CardHeader>
              <CardContent>
                {el.data.byRoundType.length ? (
                  <ChartContainer config={cfg} className="h-56 w-full">
                    <BarChart data={el.data.byRoundType.map((r) => ({ ...r, roundType: titleCase(r.roundType) }))}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="roundType" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} width={28} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="count" fill="var(--color-count)" radius={4} />
                    </BarChart>
                  </ChartContainer>
                ) : <span className="text-sm text-muted-foreground">Nothing to show yet.</span>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Repeatedly fail the same round type</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-1 text-sm">
                {el.data.repeatFailures.map((r) => <div key={r.studentId + r.roundType} className="flex justify-between"><span>{r.name} <span className="text-muted-foreground">{r.enrollmentNo}</span></span><span>{titleCase(r.roundType)} ×{r.times}</span></div>)}
                {el.data.repeatFailures.length === 0 && <span className="text-muted-foreground">None.</span>}
              </CardContent>
            </Card>
            <div className="lg:col-span-2"><EliminationStudents departmentId={dept || undefined} batchId={batch || undefined} /></div>
          </div>
        )}
      </TabsContent>
    </Tabs>
  )
}
