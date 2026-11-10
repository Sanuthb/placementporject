"use client"

import * as React from "react"

import { OptionSelect } from "@/components/option-select"
import { ReadinessPanel, type ReadinessResult, type Trend } from "@/components/readiness-panel"
import { Skeleton } from "@/components/ui/skeleton"
import { useApi } from "@/lib/web/use-api"

/** My Career Readiness Index and my readiness for a particular job. The two are separate measures. */
export function StudentReadiness() {
  const career = useApi<{ index: ReadinessResult; trend: Trend }>("/api/student/readiness")
  const jobs = useApi<{ id: string; title: string; companyName: string }[]>("/api/student/readiness/jobs")
  const [jdId, setJdId] = React.useState("")
  const job = useApi<{ job: { title: string; company: string }; readiness: ReadinessResult; trend: Trend }>(jdId ? `/api/student/readiness/jobs/${jdId}` : null)
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      {!career.data ? <Skeleton className="h-64" /> : <ReadinessPanel title="Career Readiness Index" description="How developed you are overall, from your verified profile, results, interviews, projects and learning. Personality results are never used." result={career.data.index} trend={career.data.trend} />}
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Readiness for a job</h3>
        {!jobs.data ? <Skeleton className="h-10" /> : jobs.data.length === 0 ? <p className="text-sm text-muted-foreground">Job readiness appears here once you are in a preparation campaign or have applied to a drive.</p> : <OptionSelect className="w-full max-w-md" value={jdId} onChange={setJdId} options={jobs.data.map((j) => ({ value: j.id, label: `${j.title} (${j.companyName})` }))} placeholder="Choose a job" />}
      </div>
      {jdId && (!job.data ? <Skeleton className="h-64" /> : <ReadinessPanel title={`Job readiness: ${job.data.job.title}`} description={`For ${job.data.job.company}. Whether you meet the required criteria is shown separately from the score.`} result={job.data.readiness} trend={job.data.trend} />)}
    </div>
  )
}
