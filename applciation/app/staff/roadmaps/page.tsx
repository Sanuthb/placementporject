"use client"

import Link from "next/link"
import * as React from "react"

import { OptionSelect } from "@/components/option-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useApi } from "@/lib/web/use-api"
import { useLookups } from "@/lib/web/lookups"

type Row = { id: string; name: string; enrollmentNo: string; department: string; batch: string; programme: string | null; mentor: string | null; isMine: boolean; started: boolean; targetRole: string | null; percent: number; done: number; total: number; overdue: number; currentSemester: number | null }
type Data = { items: Row[]; summary: { students: number; started: number; notStarted: number; behind: number; noRole: number; averagePercent: number | null } }
const STATUS = [{ value: "all", label: "Everyone" }, { value: "behind", label: "Behind plan" }, { value: "on_track", label: "On track" }, { value: "no_role", label: "No target role" }, { value: "not_started", label: "Not started" }]

/** Roadmap progress across students, for placement staff and for faculty (their mentees and allocated students). */
export default function RoadmapsPage() {
  const lk = useLookups()
  const [status, setStatus] = React.useState("all"), [dept, setDept] = React.useState(""), [batch, setBatch] = React.useState(""), [q, setQ] = React.useState("")
  const { data } = useApi<Data>("/api/roadmaps", { status: status === "all" ? undefined : status, departmentId: dept || undefined, batchId: batch || undefined, q: q || undefined })
  const stat = (label: string, v: string | number | null) => <Card size="sm"><CardContent className="flex flex-col"><span className="text-xs text-muted-foreground">{label}</span><span className="text-2xl font-semibold">{v ?? "—"}</span></CardContent></Card>
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader><CardTitle>Career roadmaps</CardTitle><CardDescription>How students are getting on with their development plans. A roadmap is created when the student first opens it.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3">
          {data ? <div className="grid grid-cols-2 gap-2 md:grid-cols-5">{stat("Students", data.summary.students)}{stat("Started", data.summary.started)}{stat("Behind plan", data.summary.behind)}{stat("No target role", data.summary.noRole)}{stat("Average progress", data.summary.averagePercent == null ? null : `${data.summary.averagePercent}%`)}</div> : <Skeleton className="h-16" />}
          <div className="flex flex-wrap gap-2">
            <OptionSelect className="w-44" value={status} onChange={setStatus} options={STATUS} placeholder="Status" />
            <OptionSelect className="w-52" value={dept} onChange={setDept} options={lk.departments} placeholder="All departments" />
            <OptionSelect className="w-52" value={batch} onChange={setBatch} options={lk.batches} placeholder="All batches" />
            <Input className="w-56" placeholder="Search name or admission no." value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search students" />
          </div>
          {!data ? <Skeleton className="h-48" /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Programme</TableHead><TableHead>Target role</TableHead><TableHead className="w-48">Progress</TableHead><TableHead>Mentor</TableHead><TableHead className="text-right">Roadmap</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.name}<div className="text-xs text-muted-foreground">{r.enrollmentNo} · {r.department} · {r.batch}</div></TableCell>
                    <TableCell className="text-sm">{r.programme ?? "—"}{r.currentSemester ? <div className="text-xs text-muted-foreground">Semester {r.currentSemester}</div> : null}</TableCell>
                    <TableCell className="text-sm">{r.started ? r.targetRole ?? <span className="text-muted-foreground">Not chosen</span> : "—"}</TableCell>
                    <TableCell>{r.started ? <div className="flex flex-col gap-1"><Progress value={r.percent} aria-label={`${r.name} progress`} /><span className="text-xs text-muted-foreground">{r.done} of {r.total} · {r.percent}%{r.overdue ? <Badge variant="destructive" className="ml-1">{r.overdue} behind</Badge> : null}</span></div> : <Badge variant="outline">Not started</Badge>}</TableCell>
                    <TableCell className="text-sm">{r.mentor ?? "—"}{r.isMine && <Badge variant="secondary" className="ml-1">Your mentee</Badge>}</TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="outline" disabled={!r.started} render={<Link href={`/staff/roadmaps/${r.id}`} />}>Open</Button></TableCell>
                  </TableRow>
                ))}
                {data.items.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">No students match.</TableCell></TableRow>}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
