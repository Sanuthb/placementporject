"use client"

import * as React from "react"
import Link from "next/link"
import { BookmarkIcon } from "lucide-react"

import { OptionSelect } from "@/components/option-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api, toastError } from "@/lib/web/api"
import { JOB_TYPES, TIERS } from "@/lib/web/enums"
import { countdown, fmtDate, fmtDateTime, fmtLpa, statusVariant, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Drive = {
  id: string; role: string; jobType: string; location: string | null; packageMinLpa: number | string | null; packageMaxLpa: number | string | null; driveDate: string; applicationDeadline: string
  company: { name: string; tier: string }; saved: boolean; myApplication: string | null; eligibility: { eligible: boolean; blocked: boolean; reasons: string[] }
}

export default function StudentDrivesPage() {
  const [tab, setTab] = React.useState("open")
  const [now] = React.useState(() => Date.now())
  const { data, reload } = useApi<Drive[]>("/api/student/drives", { scope: tab === "past" ? "past" : undefined })
  const [q, setQ] = React.useState("")
  const [jobType, setJobType] = React.useState("")
  const [tier, setTier] = React.useState("")
  const [minPkg, setMinPkg] = React.useState("")

  async function toggleSave(d: Drive) {
    try { await api(`/api/student/drives/${d.id}/save`, { method: d.saved ? "DELETE" : "POST" }); reload() } catch (e) { toastError(e) }
  }

  const shown = (data ?? []).filter((d) => {
    const hay = `${d.company.name} ${d.role} ${d.location ?? ""}`.toLowerCase()
    return (tab !== "saved" || d.saved) && (!q || hay.includes(q.toLowerCase())) && (!jobType || d.jobType === jobType) && (!tier || d.company.tier === tier)
      && (!minPkg || Number(d.packageMaxLpa ?? d.packageMinLpa ?? 0) >= Number(minPkg))
  })

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList><TabsTrigger value="open">Open</TabsTrigger><TabsTrigger value="saved">Saved</TabsTrigger><TabsTrigger value="past">Past</TabsTrigger></TabsList>
      </Tabs>
      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-56" placeholder="Company, role or location" value={q} onChange={(e) => setQ(e.target.value)} />
        <OptionSelect className="w-44" value={jobType} onChange={setJobType} options={[{ value: "", label: "Any job type" }, ...JOB_TYPES]} placeholder="Job type" />
        <OptionSelect className="w-40" value={tier} onChange={setTier} options={[{ value: "", label: "Any tier" }, ...TIERS]} placeholder="Tier" />
        <Input className="w-36" type="number" min={0} step={0.5} placeholder="Min LPA" value={minPkg} onChange={(e) => setMinPkg(e.target.value)} />
      </div>
      {!data ? <Skeleton className="h-64" /> : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">{tab === "saved" ? "You have not saved any drives. Use the bookmark on a drive to keep it here." : tab === "past" ? "No past drives." : "No drives match."}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {shown.map((d) => (
            <Card key={d.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">{d.company.name}<Badge variant="outline">{titleCase(d.company.tier)}</Badge>
                  <Button size="icon-sm" variant="ghost" className="ml-auto" aria-label={d.saved ? "Remove from saved" : "Save for later"} onClick={() => toggleSave(d)}><BookmarkIcon className={d.saved ? "fill-current" : ""} /></Button>
                </CardTitle>
                <CardDescription>{d.role} · {titleCase(d.jobType)}{d.location ? ` · ${d.location}` : ""}{d.packageMinLpa || d.packageMaxLpa ? ` · ${fmtLpa(d.packageMinLpa)} to ${fmtLpa(d.packageMaxLpa)}` : ""}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <div className="text-muted-foreground">Apply by {fmtDateTime(d.applicationDeadline)} ({countdown(d.applicationDeadline, now)}) · Drive on {fmtDate(d.driveDate)}</div>
                <div className="flex flex-wrap items-center gap-2">
                  {d.myApplication ? <Badge variant={statusVariant(d.myApplication)}>Applied: {titleCase(d.myApplication)}</Badge> : tab === "past" ? null : d.eligibility.blocked ? <Badge variant="destructive">Blocked</Badge> : d.eligibility.eligible ? <Badge>You are eligible</Badge> : <Badge variant="secondary">Not eligible</Badge>}
                  <Button size="sm" className="ml-auto" variant="outline" render={<Link href={`/student/drives/${d.id}`} />}>{d.myApplication || tab === "past" ? "View" : d.eligibility.eligible ? "View and apply" : "See why"}</Button>
                </div>
                {!d.myApplication && tab !== "past" && !d.eligibility.eligible && d.eligibility.reasons.length > 0 && <ul className="list-disc pl-5 text-muted-foreground">{d.eligibility.reasons.slice(0, 3).map((r) => <li key={r}>{r}</li>)}</ul>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
