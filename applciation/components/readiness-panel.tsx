"use client"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { fmtDate } from "@/lib/web/format"

export type Part = { key: string; label: string; weight: number; value: number | null; points: number; note: string; evidence: string[] }
export type ReadinessResult = {
  score: number; band: string; coverage: number; confidence: "GOOD" | "SOME" | "LITTLE"; components: Part[]; explanation: string[]; nextSteps: string[]; disclaimer: string
  gate?: string; gateLabel?: string; gateReasons?: string[]
}
export type Trend = { history: { day: string; score: number }[]; sinceFirst: number | null; sincePrevious: number | null }
const BAND: Record<string, string> = { JUST_STARTING: "Just starting", BUILDING: "Building", PROGRESSING: "Progressing", STRONG: "Strong", VERY_STRONG: "Very strong" }
const CONF = { GOOD: "Based on good evidence", SOME: "Based on some evidence", LITTLE: "Based on little evidence" }

/** One readiness measure, part by part: what each part is, what it found, and what would raise it. */
export function ReadinessPanel({ title, description, result, trend }: { title: string; description: string; result: ReadinessResult; trend?: Trend | null }) {
  const gateBad = result.gate === "NOT_ELIGIBLE"
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-3xl font-semibold">{result.score}<span className="text-base font-normal text-muted-foreground"> / 100</span></span>
          <Badge>{BAND[result.band] ?? result.band}</Badge><Badge variant="outline">{CONF[result.confidence]} ({result.coverage}% of the parts measured)</Badge>
          {trend?.sincePrevious != null && <Badge variant={trend.sincePrevious < 0 ? "destructive" : "secondary"}>{trend.sincePrevious > 0 ? "+" : ""}{trend.sincePrevious} since last check</Badge>}
        </div>
        {result.gate && <Alert variant={gateBad ? "destructive" : "default"}><AlertTitle>{result.gateLabel}</AlertTitle>{result.gateReasons && result.gateReasons.length > 0 && <AlertDescription>{result.gateReasons.join(" · ")}</AlertDescription>}</Alert>}
        <ul className="list-disc pl-5">{result.explanation.map((e) => <li key={e}>{e}</li>)}</ul>
        <div className="flex flex-col gap-3">
          {result.components.map((c) => (
            <div key={c.key} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2"><span className="font-medium">{c.label} <span className="text-xs font-normal text-muted-foreground">counts for {c.weight}%</span></span><span>{c.value === null ? "Not measured" : `${Math.round(c.value * 100)}%`}</span></div>
              <Progress value={c.value === null ? 0 : c.value * 100} />
              <span className="text-xs text-muted-foreground">{c.note}</span>
              {c.evidence.length > 0 && <span className="text-xs text-muted-foreground">{c.evidence.slice(0, 6).join(" · ")}</span>}
            </div>
          ))}
        </div>
        {result.nextSteps.length > 0 && <div><div className="font-medium">What would raise it</div><ul className="list-disc pl-5">{result.nextSteps.map((s) => <li key={s}>{s}</li>)}</ul></div>}
        {trend && trend.history.length > 1 && <div><div className="font-medium">Over time</div><p className="text-muted-foreground">{trend.history.map((h) => `${h.score} (${fmtDate(h.day)})`).join(" → ")}</p></div>}
        <p className="text-xs text-muted-foreground">{result.disclaimer}</p>
      </CardContent>
    </Card>
  )
}
