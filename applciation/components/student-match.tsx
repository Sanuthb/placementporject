"use client"

import Link from "next/link"

import { MatchEvidence, type Param, type Req } from "@/components/match-evidence"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Skeleton } from "@/components/ui/skeleton"
import { useApi } from "@/lib/web/use-api"

type M = {
  available: boolean; score?: number; parameters?: Param[]; requirements?: Req[]; skills?: { matched: string[]; partial: string[]; missing: string[] }; mandatory?: { status: string; met: number; total: number }; explanation?: string[]
  preparation?: { skill: string; courses: { id: string; title: string }[]; resources: { id: string; title: string }[] }[]
}

/** How I match this drive, from my own records: an aid for deciding where to prepare, not a decision. */
export function StudentMatch({ driveId }: { driveId: string }) {
  const { data } = useApi<M>(`/api/student/drives/${driveId}/match`)
  if (!data) return <Skeleton className="h-32" />
  if (!data.available) return null
  const m = data
  return (
    <Card>
      <CardHeader><CardTitle>How you match this job: {m.score}%</CardTitle><CardDescription>Worked out from your own profile and college records. It helps you see where to prepare; it does not decide whether you can apply or are selected. Your personality results are never used.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <ul className="list-disc pl-5">{m.explanation?.map((e, i) => <li key={i}>{e}</li>)}</ul>
        <div className="flex flex-wrap gap-1">{m.skills?.matched.map((s) => <Badge key={s}>{s}</Badge>)}{m.skills?.partial.map((s) => <Badge key={s} variant="secondary">{s} (partly)</Badge>)}{m.skills?.missing.map((s) => <Badge key={s} variant="destructive">{s} (missing)</Badge>)}</div>
        {m.preparation && m.preparation.length > 0 && (
          <div className="flex flex-col gap-1"><span className="font-medium">To close the gaps</span>
            {m.preparation.map((p) => (
              <div key={p.skill}><span className="font-medium">{p.skill}: </span>
                {p.courses.length + p.resources.length === 0 ? <span className="text-muted-foreground">nothing in the college teaches this yet; look for it outside</span> : <>{p.courses.map((c) => <Button key={c.id} variant="link" size="sm" render={<Link href={`/student/courses/${c.id}`} />}>Course: {c.title}</Button>)}{p.resources.length > 0 && <Button variant="link" size="sm" render={<Link href="/student/resources" />}>Study material: {p.resources.map((r) => r.title).join(", ")}</Button>}</>}
              </div>
            ))}
          </div>
        )}
        <Collapsible><CollapsibleTrigger render={<Button variant="outline" size="sm" />}>Show the evidence</CollapsibleTrigger><CollapsibleContent className="pt-3"><MatchEvidence parameters={m.parameters ?? []} requirements={m.requirements ?? []} /></CollapsibleContent></Collapsible>
      </CardContent>
    </Card>
  )
}
