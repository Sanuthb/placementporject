"use client"

import * as React from "react"
import Link from "next/link"

import { OptionSelect } from "@/components/option-select"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmtDate, statusVariant, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type T = { id: string; category: string; subject: string; status: string; createdAt: string; student: { name: string; enrollmentNo: string }; assignee: { name: string } | null; _count: { messages: number } }
const STATUS = ["OPEN", "IN_PROGRESS", "RESOLVED"].map((v) => ({ value: v, label: titleCase(v) }))

export default function TicketsPage() {
  const [status, setStatus] = React.useState("OPEN")
  const { data } = useApi<{ items: T[] }>("/api/tickets", { status, limit: 100 })
  return (
    <div className="flex flex-col gap-4">
      <OptionSelect className="w-44" value={status} onChange={setStatus} options={[{ value: "", label: "All" }, ...STATUS]} placeholder="Status" />
      {!data ? <Skeleton className="h-40" /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Request</TableHead><TableHead>Student</TableHead><TableHead>Type</TableHead><TableHead>Assigned to</TableHead><TableHead>Status</TableHead><TableHead>Age</TableHead></TableRow></TableHeader>
          <TableBody>
            {data.items.map((t) => <TableRow key={t.id}><TableCell><Link href={`/staff/tickets/${t.id}`} className="font-medium underline-offset-4 hover:underline">{t.subject}</Link><div className="text-xs text-muted-foreground">{t._count.messages} messages</div></TableCell><TableCell>{t.student.name}<div className="text-xs text-muted-foreground">{t.student.enrollmentNo}</div></TableCell><TableCell>{titleCase(t.category)}</TableCell><TableCell>{t.assignee?.name ?? "Unassigned"}</TableCell><TableCell><Badge variant={statusVariant(t.status === "RESOLVED" ? "VERIFIED" : "PENDING")}>{titleCase(t.status)}</Badge></TableCell><TableCell>{fmtDate(t.createdAt)}</TableCell></TableRow>)}
            {data.items.length === 0 && <TableRow><TableCell colSpan={6} className="text-muted-foreground">No requests.</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
