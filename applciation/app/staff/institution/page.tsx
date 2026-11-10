"use client"

import Link from "next/link"

import { PrepDashboard } from "@/components/prep-dashboard"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { download, toastError } from "@/lib/web/api"
import { fmtLpa } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Row = { id: string; name: string; total: number; placed: number; percentage: number }
type Data = {
  placement: { placed: number; total: number; percentage: number }
  packages: { count: number; min: number | null; max: number | null; average: number | null }
  offers: { made: number; accepted: number; declined: number; pending: number }
  byDepartment: Row[]; byBatch: Row[]
  byYear: { year: number; offers: number; accepted: number; averageLpa: number | null; highestLpa: number | null }[]
  companies: { total: number; active: number; visited: number; recruiters: number; drives: number; upcoming: number; repeat: number; returningAcrossYears: number; topRecruiters: { company: string; accepted: number }[] }
  training: { courses: { published: number }; learners: number; learnerPercent: number; completionPercent: number; enrolments: number } | null
}
const Stat = ({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) => <div className="rounded-xl bg-muted/50 p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="text-xl font-semibold tabular-nums">{value}</div>{sub && <div className="text-xs text-muted-foreground">{sub}</div>}</div>

/** The principal's or director's dashboard. Read-only: placement, departments and batches, packages by year, company engagement, training and preparation, with the reports a principal can download. */
export default function InstitutionPage() {
  const { data, error } = useApi<Data>("/api/dashboard/institution")
  if (error) return <Alert variant="destructive"><AlertTitle>Could not load the dashboard</AlertTitle><AlertDescription>{error instanceof Error ? error.message : "Try again"}</AlertDescription></Alert>
  if (!data) return <div className="grid gap-4 md:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>
  const dep = (rows: Row[], title: string, description: string) => (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {rows.map((r) => <div key={r.id} className="flex items-center gap-3"><span className="w-32 truncate">{r.name}</span><Progress value={r.percentage} className="flex-1" /><span className="w-24 text-right tabular-nums text-muted-foreground">{r.placed}/{r.total} ({r.percentage}%)</span></div>)}
        {rows.length === 0 && <span className="text-muted-foreground">No registered students yet.</span>}
      </CardContent>
    </Card>
  )
  return (
    <div className="flex max-w-6xl flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Placement rate" value={`${data.placement.percentage}%`} sub={`${data.placement.placed} of ${data.placement.total} registered students`} />
        <Stat label="Average package" value={data.packages.average === null ? "-" : fmtLpa(data.packages.average)} sub={data.packages.max === null ? undefined : `highest ${fmtLpa(data.packages.max)}`} />
        <Stat label="Offers" value={data.offers.accepted} sub={`${data.offers.made} made, ${data.offers.pending} waiting, ${data.offers.declined} declined`} />
        <Stat label="Companies visited" value={data.companies.visited} sub={`${data.companies.upcoming} drives coming up`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">{dep(data.byDepartment, "Departments", "Registered students placed")}{dep(data.byBatch, "Batches", "Registered students placed")}</div>
      <Card>
        <CardHeader><CardTitle>Placement by year</CardTitle><CardDescription>Offers made and accepted, and the packages accepted</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Year</TableHead><TableHead className="text-right">Offers</TableHead><TableHead className="text-right">Accepted</TableHead><TableHead className="text-right">Average</TableHead><TableHead className="text-right">Highest</TableHead></TableRow></TableHeader>
            <TableBody>{data.byYear.map((y) => <TableRow key={y.year}><TableCell>{y.year}</TableCell><TableCell className="text-right">{y.offers}</TableCell><TableCell className="text-right">{y.accepted}</TableCell><TableCell className="text-right">{y.averageLpa === null ? "-" : fmtLpa(y.averageLpa)}</TableCell><TableCell className="text-right">{y.highestLpa === null ? "-" : fmtLpa(y.highestLpa)}</TableCell></TableRow>)}{data.byYear.length === 0 && <TableRow><TableCell colSpan={5} className="text-muted-foreground">No offers yet.</TableCell></TableRow>}</TableBody>
          </Table>
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Company engagement</CardTitle><CardDescription>Who recruits here, and whether they come back</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="grid grid-cols-2 gap-3"><Stat label="Companies on record" value={data.companies.total} sub={`${data.companies.active} active`} /><Stat label="Recruiter accounts" value={data.companies.recruiters} /><Stat label="Drives held" value={data.companies.drives} /><Stat label="Came back" value={data.companies.repeat} sub={`${data.companies.returningAcrossYears} across different years`} /></div>
            {data.companies.topRecruiters.map((t, i) => <div key={t.company} className="flex justify-between gap-2"><span><span className="text-muted-foreground">{i + 1}.</span> {t.company}</span><span>{t.accepted} accepted</span></div>)}
          </CardContent>
        </Card>
        {data.training && (
          <Card>
            <CardHeader><CardTitle>Training and learning</CardTitle><CardDescription>Courses on the college&apos;s learning platform</CardDescription></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm"><Stat label="Published courses" value={data.training.courses.published} /><Stat label="Students learning" value={`${data.training.learnerPercent}%`} sub={`${data.training.learners} students`} /><Stat label="Completion" value={`${data.training.completionPercent}%`} sub={`${data.training.enrolments} enrolments`} /></CardContent>
          </Card>
        )}
      </div>
      <div className="grid gap-4"><PrepDashboard withPrep={false} /></div>
      <Card>
        <CardHeader><CardTitle>Reports</CardTitle><CardDescription>Downloads for meetings and accreditation</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => download("/api/reports/placement.pdf").catch(toastError)}>Placement report (PDF)</Button>
          <Button variant="outline" onClick={() => download("/api/reports/nirf").catch(toastError)}>NIRF-style data (Excel)</Button>
          <Button variant="outline" render={<Link href="/staff/analytics" />}>Analytics</Button>
          <Button variant="outline" render={<Link href="/staff/reports" />}>All reports</Button>
        </CardContent>
      </Card>
    </div>
  )
}
