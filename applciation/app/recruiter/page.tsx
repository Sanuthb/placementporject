"use client"

import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { fmtDate, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Me = { name: string; company: { name: string; tier: string; industry: string | null } }
type Drive = { id: string; role: string; jobType: string; status: string; driveDate: string; venue: string | null; rounds: { id: string }[] }

export default function RecruiterHome() {
  const me = useApi<Me>("/api/recruiter/me")
  const drives = useApi<Drive[]>("/api/recruiter/drives")
  if (!me.data || !drives.data) return <Skeleton className="h-48" />
  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <Card><CardHeader><CardTitle className="text-xl">{me.data.company.name}</CardTitle><CardDescription>{me.data.company.industry ?? "Recruiter portal"} · {titleCase(me.data.company.tier)}</CardDescription></CardHeader></Card>
      <h2 className="text-sm font-medium">Your campus drives</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {drives.data.map((d) => (
          <Card key={d.id}>
            <CardHeader><CardTitle>{d.role}</CardTitle><CardDescription>{titleCase(d.jobType)} · {fmtDate(d.driveDate)}{d.venue ? ` · ${d.venue}` : ""}</CardDescription></CardHeader>
            <CardContent className="flex items-center gap-2"><Badge variant={d.status === "PUBLISHED" ? "default" : "secondary"}>{titleCase(d.status)}</Badge><Button size="sm" className="ml-auto" render={<Link href={`/recruiter/drives/${d.id}`} />}>Open</Button></CardContent>
          </Card>
        ))}
        {drives.data.length === 0 && <p className="text-sm text-muted-foreground">No drives have been published for your company yet.</p>}
      </div>
    </div>
  )
}
