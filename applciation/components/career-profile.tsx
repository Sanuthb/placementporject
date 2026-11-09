"use client"

import { PrinterIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { useApi } from "@/lib/web/use-api"
import type { Recommendation } from "@/lib/careerRecommendations"
import type { Dimension } from "@/lib/intelligence/evidence"

type Profile = { dimensions: Dimension[]; recommendations: Recommendation[]; coverage: { measured: number; total: number; missing: string[] }; personalityShared?: boolean }
const KIND: Record<string, string> = { measured: "Measured", declared: "Self-declared", none: "No data yet" }

/** The 360° career profile: every dimension with its own score (there is deliberately no single overall score), the gaps, and recommendations. */
export function CareerProfile({ endpoint, printable = false, title = "Career profile" }: { endpoint: string; printable?: boolean; title?: string }) {
  const { data, loading } = useApi<Profile>(endpoint)
  if (loading && !data) return <Skeleton className="h-64 rounded-xl" />
  if (!data) return null
  const recs = data.recommendations
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Badge variant="outline">{data.coverage.measured} of {data.coverage.total} areas measured</Badge>
        {printable && <Button size="sm" variant="outline" className="ml-auto" onClick={() => window.print()}><PrinterIcon />Print or save as PDF</Button>}
      </div>
      <Alert>
        <AlertTitle>How to read this</AlertTitle>
        <AlertDescription>Each area has its own result; there is no single overall score. Personality, interests and behavioural style describe preferences. They are never used to decide eligibility, shortlisting or hiring.{data.personalityShared === false && " The student has chosen not to share private results, so those areas show as empty here."}</AlertDescription>
      </Alert>

      {recs.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Recommendations</CardTitle><CardDescription>Worked out from the results below.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {recs.map((r) => (
              <div key={r.id} className="flex flex-col gap-0.5 border-b pb-2 last:border-0">
                <div className="flex flex-wrap items-center gap-2"><Badge variant={r.kind === "improve" ? "destructive" : r.kind === "strength" ? "default" : "secondary"}>{r.kind === "improve" ? "Improve" : r.kind === "strength" ? "Strength" : r.kind === "take" ? "Take a test" : "Explore"}</Badge><span className="font-medium">{r.title}</span></div>
                <span className="text-muted-foreground">{r.why}</span>
                <span>{r.action}{r.href && printable && <> <a className="underline print:hidden" href={r.href}>Open</a></>}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {data.dimensions.map((d) => (
          <Card key={d.key} className="break-inside-avoid">
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">{d.label} <Badge variant={d.kind === "measured" ? "default" : "outline"}>{KIND[d.kind]}</Badge></CardTitle>
              {d.note && <CardDescription>{d.note}</CardDescription>}
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {d.score != null && <div className="flex flex-col gap-1"><div className="flex justify-between"><span>Score</span><span className="font-medium">{d.score}%</span></div><Progress value={d.score} aria-label={`${d.label} score`} /></div>}
              {d.items.slice(0, 8).map((i, k) => <div key={k} className="flex justify-between gap-2"><span className="min-w-0 truncate">{i.label}</span><span className="shrink-0 text-muted-foreground">{i.value ?? "—"}</span></div>)}
              {d.gaps.slice(0, 2).map((g, k) => <span key={k} className="text-xs text-muted-foreground">{g}</span>)}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
