"use client"

import Link from "next/link"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmtDate, statusVariant, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"
import type { Completion } from "@/lib/profileCompletion"

type Data = { stage: string; sections: { section: string; required: boolean; status: string; submittedAt: string | null; reviewComment: string | null; hasPendingRevision: boolean }[] }

export default function ProfilePage() {
  const { data } = useApi<Data>("/api/student/sections")
  const done = useApi<Completion>("/api/student/completion")
  if (!data || !done.data) return <Skeleton className="h-64" />
  const c = done.data
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Profile {c.percent}% complete</CardTitle>
          <CardDescription>Status: {titleCase(data.stage)}. {c.done} of {c.total} required items verified{c.waiting ? `, ${c.waiting} waiting for the placement cell` : ""}. You can apply to drives once you are onboarded.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Progress value={c.percent} aria-label="Your part done" />
            <div className="flex justify-between text-xs text-muted-foreground"><span>Your part: {c.percent}%</span><span>Verified by the placement cell: {c.verifiedPercent}%</span></div>
          </div>
          <Alert variant={c.nextAction.kind === "fix" ? "destructive" : "default"}>
            <AlertTitle>Next: {c.nextAction.title}</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-2">
              <span>{c.nextAction.detail}</span>
              {c.nextAction.href && <Button size="sm" render={<Link href={c.nextAction.href} />}>{c.nextAction.kind === "fix" ? "Fix it" : c.nextAction.kind === "optional" ? "Add" : "Go"}</Button>}
            </AlertDescription>
          </Alert>
          {c.missing.length > 0 && (
            <div className="flex flex-col gap-1 text-sm">
              <div className="font-medium">Still missing</div>
              <ul className="flex flex-col gap-1">
                {c.missing.map((m) => (
                  <li key={m.key} className="flex flex-wrap items-center gap-2">
                    <Badge variant={m.state === "fix" ? "destructive" : "outline"}>{m.state === "fix" ? "Fix" : m.kind === "document" ? "Upload" : "To do"}</Badge>
                    <Link href={m.href} className="underline-offset-4 hover:underline">{m.label}</Link>
                    {m.detail && <span className="text-muted-foreground">{m.detail}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
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
