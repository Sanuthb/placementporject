"use client"

import * as React from "react"
import Link from "next/link"

import { OptionSelect } from "@/components/option-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAuth } from "@/lib/web/auth"
import { DRIVE_STATUS } from "@/lib/web/enums"
import { fmtDate, fmtLpa, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Drive = { id: string; role: string; jobType: string; status: string; driveDate: string; applicationDeadline: string; packageMinLpa: number | string | null; packageMaxLpa: number | string | null; company: { name: string; tier: string }; _count: { applications: number } }

export default function DrivesPage() {
  const { state } = useAuth()
  const canEdit = state.status === "ready" && state.profile.role !== "DEPARTMENT_COORDINATOR"
  const [status, setStatus] = React.useState("")
  const { data, loading } = useApi<{ items: Drive[] }>("/api/drives", { status, limit: 100 })
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <OptionSelect className="w-44" value={status} onChange={setStatus} options={[{ value: "", label: "All statuses" }, ...DRIVE_STATUS]} placeholder="Status" />
        {canEdit && <Button className="ml-auto" render={<Link href="/staff/drives/new" />}>Create drive</Button>}
      </div>
      {loading && !data ? <Skeleton className="h-48" /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Company / role</TableHead><TableHead>Type</TableHead><TableHead>Package</TableHead><TableHead>Deadline</TableHead><TableHead>Drive date</TableHead><TableHead>Applied</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {data?.items.map((d) => (
              <TableRow key={d.id}>
                <TableCell><Link href={`/staff/drives/${d.id}`} className="font-medium underline-offset-4 hover:underline">{d.company.name}</Link><div className="text-xs text-muted-foreground">{d.role}</div></TableCell>
                <TableCell>{titleCase(d.jobType)}</TableCell>
                <TableCell>{d.packageMinLpa || d.packageMaxLpa ? `${fmtLpa(d.packageMinLpa)} to ${fmtLpa(d.packageMaxLpa)}` : "—"}</TableCell>
                <TableCell>{fmtDate(d.applicationDeadline)}</TableCell>
                <TableCell>{fmtDate(d.driveDate)}</TableCell>
                <TableCell>{d._count.applications}</TableCell>
                <TableCell><Badge variant={d.status === "PUBLISHED" ? "default" : d.status === "CANCELLED" ? "destructive" : "secondary"}>{titleCase(d.status)}</Badge></TableCell>
              </TableRow>
            ))}
            {data?.items.length === 0 && <TableRow><TableCell colSpan={7} className="text-muted-foreground">No drives yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
