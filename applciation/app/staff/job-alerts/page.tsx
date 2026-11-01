"use client"

import { toast } from "sonner"

import * as React from "react"

import { MasterTab } from "@/components/master-tab"
import { JobAlertStats } from "@/components/staff-extras"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { JOB_TYPES } from "@/lib/web/enums"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, titleCase } from "@/lib/web/format"

type Alert = { id: string; title: string; companyName: string; jobType: string; status: string; deadline: string | null; applyUrl: string }

export default function JobAlertsPage() {
  const [stats, setStats] = React.useState<string | null>(null)
  const act = async (id: string, path: "publish" | "close", reload: () => void) => {
    try { await api(`/api/job-alerts/${id}/${path}`, { method: "POST", ...(path === "publish" ? { body: { notifyByEmail: false } } : {}) }); toast.success(path === "publish" ? "Published to students" : "Closed"); reload() } catch (e) { toastError(e) }
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">Share jobs and internships that are not campus drives. Alerts start as drafts; publish one to show it to students.</p>
      <MasterTab<Alert> endpoint="/api/job-alerts" addLabel="New job alert"
        fields={[{ name: "title", label: "Title" }, { name: "companyName", label: "Company" }, { name: "jobType", label: "Type", type: "select", options: JOB_TYPES, required: true }, { name: "location", label: "Location", required: false }, { name: "applyUrl", label: "Application link" }, { name: "deadline", label: "Apply by", type: "date", required: false }, { name: "description", label: "Description", required: false }]}
        toBody={(v) => ({ title: v.title, companyName: v.companyName, jobType: v.jobType, applyUrl: v.applyUrl, ...(v.location ? { location: v.location } : {}), ...(v.deadline ? { deadline: new Date(`${v.deadline}T23:59:59`).toISOString() } : {}), ...(v.description ? { description: v.description } : {}) })}
        columns={[
          { label: "Job", cell: (r) => <>{r.title}<div className="text-xs text-muted-foreground">{r.companyName} · {titleCase(r.jobType)}</div></> },
          { label: "Apply by", cell: (r) => fmtDate(r.deadline) },
          { label: "Status", cell: (r) => <Badge variant={r.status === "PUBLISHED" ? "default" : "secondary"}>{titleCase(r.status)}</Badge> },
          { label: "Reach", cell: (r) => r.status === "DRAFT" ? "—" : <Button size="sm" variant="outline" onClick={() => setStats(r.id)}>Views and clicks</Button> },
          { label: "Action", cell: (r, reload) => r.status === "DRAFT" ? <Button size="sm" onClick={() => act(r.id, "publish", reload)}>Publish</Button> : r.status === "PUBLISHED" ? <Button size="sm" variant="outline" onClick={() => act(r.id, "close", reload)}>Close</Button> : null },
        ]} />
      <JobAlertStats id={stats} onClose={() => setStats(null)} />
    </div>
  )
}
