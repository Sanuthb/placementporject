"use client"

import { MasterTab } from "@/components/master-tab"
import { Badge } from "@/components/ui/badge"
import { JOB_TYPES } from "@/lib/web/enums"
import { statusVariant, titleCase } from "@/lib/web/format"

type Job = { id: string; title: string; jobType: string; status: string; reviewNote: string | null }

export default function RecruiterJobsPage() {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">Jobs you post are reviewed by the placement cell before students see them.</p>
      <MasterTab<Job> endpoint="/api/recruiter/jobs" addLabel="Post a job"
        fields={[{ name: "title", label: "Job title" }, { name: "jobType", label: "Type", type: "select", options: JOB_TYPES, required: true }, { name: "location", label: "Location", required: false }, { name: "applyUrl", label: "Application link", type: "text" }, { name: "description", label: "Description", required: false }]}
        toBody={(v) => ({ title: v.title, jobType: v.jobType, applyUrl: v.applyUrl, ...(v.location ? { location: v.location } : {}), ...(v.description ? { description: v.description } : {}) })}
        columns={[{ label: "Job", cell: (r) => r.title }, { label: "Type", cell: (r) => titleCase(r.jobType) }, { label: "Review", cell: (r) => <><Badge variant={statusVariant(r.status)}>{titleCase(r.status)}</Badge>{r.reviewNote && <div className="text-xs text-muted-foreground">{r.reviewNote}</div>}</> }]} />
    </div>
  )
}
