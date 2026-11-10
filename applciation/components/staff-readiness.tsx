"use client"

import * as React from "react"

import { OptionSelect } from "@/components/option-select"
import { ReadinessPanel, type ReadinessResult } from "@/components/readiness-panel"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useApi } from "@/lib/web/use-api"

/** A student's readiness for staff: the Career Readiness Index and, for a chosen approved job, the Job-Specific Readiness Score. */
export function StaffStudentReadiness({ studentId }: { studentId: string }) {
  const [jdId, setJdId] = React.useState("")
  const jds = useApi<{ id: string; title: string; companyName: string }[]>("/api/jds", { status: "APPROVED" })
  const { data } = useApi<{ career: ReadinessResult; job: { title: string; company: string; readiness: ReadinessResult } | null }>(`/api/students/${studentId}/readiness`, { jdId: jdId || undefined })
  return (
    <div className="flex flex-col gap-4">
      <Alert><AlertTitle>For coaching, not for screening</AlertTitle><AlertDescription>Interview scores here count only interviews you assigned; a student&apos;s own practice interviews are private. Personality results are never used.</AlertDescription></Alert>
      {!data ? <Skeleton className="h-64" /> : <ReadinessPanel title="Career Readiness Index" description="Overall development." result={data.career} />}
      <div className="max-w-md"><OptionSelect className="w-full" value={jdId} onChange={setJdId} options={[{ value: "", label: "No job selected" }, ...(jds.data ?? []).map((j) => ({ value: j.id, label: `${j.title} (${j.companyName})` }))]} placeholder="Readiness for a job" /></div>
      {data?.job && <ReadinessPanel title={`Job readiness: ${data.job.title}`} description={`For ${data.job.company}.`} result={data.job.readiness} />}
    </div>
  )
}

type Row = { studentId: string; name: string; enrollmentNo: string; gate: string; gateLabel: string; score: number; band: string; coverage: number; missingSkills: string[]; weakest: string | null }
/** Everyone's readiness for one job. Eligibility is shown beside the score, never mixed into it. */
export function JdReadiness({ jdId, campaignId }: { jdId: string; campaignId?: string }) {
  const [all, setAll] = React.useState(false)
  const { data } = useApi<{ students: Row[]; truncated: boolean }>(`/api/jds/${jdId}/readiness`, { campaignId, includeIneligible: all ? "1" : "0" })
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">Readiness shows who needs coaching and where. It is not a ranking for selection, and it does not replace the eligibility check.</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />Also list students who are not eligible</label>
      {!data ? <Skeleton className="h-40" /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Eligibility</TableHead><TableHead className="text-right">Readiness</TableHead><TableHead>Weakest part</TableHead><TableHead>Missing skills</TableHead></TableRow></TableHeader>
          <TableBody>
            {data.students.map((s) => (
              <TableRow key={s.studentId}>
                <TableCell className="font-medium">{s.name}<div className="text-xs font-normal text-muted-foreground">{s.enrollmentNo}</div></TableCell>
                <TableCell><Badge variant={s.gate === "NOT_ELIGIBLE" ? "destructive" : s.gate === "NEEDS_REVIEW" ? "secondary" : "default"}>{s.gateLabel}</Badge></TableCell>
                <TableCell className="text-right">{s.score}<div className="text-xs text-muted-foreground">{s.coverage}% measured</div></TableCell>
                <TableCell>{s.weakest ?? "-"}</TableCell>
                <TableCell className="text-xs">{s.missingSkills.join(", ") || "-"}</TableCell>
              </TableRow>
            ))}
            {data.students.length === 0 && <TableRow><TableCell colSpan={5} className="text-muted-foreground">No students to show.</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}
      {data?.truncated && <p className="text-xs text-muted-foreground">Only the first 500 students are shown. Choose a department or campaign to narrow it.</p>}
    </div>
  )
}
