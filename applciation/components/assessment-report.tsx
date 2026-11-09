"use client"

import * as React from "react"

import { OptionSelect } from "@/components/option-select"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { useApi } from "@/lib/web/use-api"
import { useLookups } from "@/lib/web/lookups"
import { categoryLabel } from "@/lib/reassessment"

type Dist = { low: number; moderate: number; high: number }
type Cat = { category: string; hidden: true; reason: string } | { category: string; hidden: false; students: number; average: number; distribution: Dist; tests: ({ title: string; hidden: true } | { title: string; hidden: false; students: number; average: number; distribution: Dist })[] }
type Career = { key: string; title: string; private: boolean; hidden: true; reason: string } | { key: string; title: string; private: boolean; hidden: false; students: number; scales: { key: string; label: string; average: number | null }[]; leaning: { key: string; label: string; students: number }[] | null }
type Report = { minGroup: number; categories: Cat[]; careerTests: Career[] }

/** Group results by kind of test. Filters follow the staff member's scope; small groups are hidden. */
export function AssessmentReport() {
  const lk = useLookups()
  const [dept, setDept] = React.useState("")
  const [batch, setBatch] = React.useState("")
  const { data } = useApi<Report>("/api/assessments/report", { departmentId: dept || undefined, batchId: batch || undefined })
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <OptionSelect className="w-56" value={dept} onChange={setDept} placeholder="All departments" options={lk.departments} />
        <OptionSelect className="w-56" value={batch} onChange={setBatch} placeholder="All batches" options={lk.batches} />
      </div>
      {!data ? <Skeleton className="h-48 rounded-xl" /> : (
        <>
          <Card className="rounded-2xl">
            <CardHeader><CardTitle>Scheduled tests by kind</CardTitle><CardDescription>Each student counts once per test, with their newest attempt. Groups of fewer than {data.minGroup} students are hidden so no one can be picked out.</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              {data.categories.length === 0 && <p className="text-muted-foreground">No finished scheduled tests for this group yet.</p>}
              {data.categories.map((c) => c.hidden ? <div key={c.category} className="text-muted-foreground">{categoryLabel(c.category)}: hidden ({c.reason})</div> : (
                <div key={c.category} className="flex flex-col gap-1 border-b pb-3 last:border-0">
                  <div className="flex items-center justify-between"><span className="font-medium">{categoryLabel(c.category)} <Badge variant="outline">{c.students} students</Badge></span><span>{c.average}% average</span></div>
                  <Progress value={c.average} aria-label={`${categoryLabel(c.category)} average`} />
                  <span className="text-xs text-muted-foreground">Below 40%: {c.distribution.low} · 40-69%: {c.distribution.moderate} · 70% and above: {c.distribution.high}</span>
                  {c.tests.map((t) => <span key={t.title} className="text-xs text-muted-foreground">{t.title}: {t.hidden ? "hidden (small group)" : `${t.average}% average, ${t.students} students`}</span>)}
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardHeader><CardTitle>Career tests (group figures only)</CardTitle><CardDescription>Interests and behavioural style are private: staff see only how many students lean each way, never who.</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              {data.careerTests.map((t) => t.hidden ? <div key={t.key} className="text-muted-foreground">{t.title}: hidden ({t.reason})</div> : (
                <div key={t.key} className="flex flex-col gap-1 border-b pb-3 last:border-0">
                  <div className="font-medium">{t.title} <Badge variant="outline">{t.students} students</Badge></div>
                  <span className="text-xs text-muted-foreground">Average by area: {t.scales.map((s) => `${s.label} ${s.average ?? "—"}%`).join(" · ")}</span>
                  {t.leaning && <span className="text-xs text-muted-foreground">Students lean towards: {t.leaning.map((l) => `${l.label} ${l.students}`).join(" · ")}</span>}
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
