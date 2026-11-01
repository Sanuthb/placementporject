"use client"

import Link from "next/link"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmtDate, statusVariant, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Data = { stage: string; sections: { section: string; required: boolean; status: string; submittedAt: string | null; reviewComment: string | null; hasPendingRevision: boolean }[] }

export default function ProfilePage() {
  const { data } = useApi<Data>("/api/student/sections")
  if (!data) return <Skeleton className="h-64" />
  const todo = data.sections.filter((s) => s.required && (s.status === "DRAFT" || s.status === "CHANGES_REQUESTED")).length
  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <AlertTitle>Your status: {titleCase(data.stage)}</AlertTitle>
        <AlertDescription>{todo ? `${todo} required section${todo > 1 ? "s" : ""} still need your attention.` : "Everything required has been submitted."} Submitted sections are checked by the placement cell. You can apply to drives once you are onboarded.</AlertDescription>
      </Alert>
      <div className="rounded-lg border p-3 text-sm">
        <div className="pb-2 font-medium">What is needed before you are verified</div>
        <ul className="flex flex-col gap-1">
          {data.sections.filter((s) => s.required).map((s) => (
            <li key={s.section} className="flex items-center gap-2">
              <span aria-hidden>{s.status === "VERIFIED" ? "✔" : s.status === "SUBMITTED" ? "…" : "○"}</span>
              <span>{titleCase(s.section)}</span>
              <span className="text-muted-foreground">{s.status === "VERIFIED" ? "verified" : s.status === "SUBMITTED" ? "waiting for the placement cell" : s.status === "CHANGES_REQUESTED" ? "changes requested" : "not submitted yet"}</span>
            </li>
          ))}
        </ul>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Section</TableHead><TableHead>Status</TableHead><TableHead>Submitted</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
        <TableBody>
          {data.sections.map((s) => (
            <TableRow key={s.section}>
              <TableCell>{titleCase(s.section)} {s.required && <span className="text-xs text-muted-foreground">(required)</span>}{s.hasPendingRevision && <Badge className="ml-2" variant="secondary">Change awaiting review</Badge>}
                {s.status === "CHANGES_REQUESTED" && s.reviewComment && <div className="text-xs text-destructive">{s.reviewComment}</div>}</TableCell>
              <TableCell><Badge variant={statusVariant(s.status)}>{titleCase(s.status)}</Badge></TableCell>
              <TableCell>{fmtDate(s.submittedAt)}</TableCell>
              <TableCell className="text-right"><Button size="sm" variant={s.status === "DRAFT" || s.status === "CHANGES_REQUESTED" ? "default" : "outline"} render={<Link href={`/student/profile/${s.section}`} />}>{s.status === "DRAFT" ? "Fill in" : s.status === "CHANGES_REQUESTED" ? "Fix" : "Open"}</Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
