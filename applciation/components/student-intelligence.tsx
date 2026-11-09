"use client"

import * as React from "react"
import { AlertTriangleIcon, InfoIcon, SparklesIcon } from "lucide-react"
import { PolarAngleAxis, PolarGrid, Radar, RadarChart } from "recharts"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { api, toastError } from "@/lib/web/api"
import { fmtDateTime, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Item = { label: string; value: string | number | null; source: string; verified: boolean }
type Dim = { key: string; label: string; kind: "measured" | "declared" | "none"; score: number | null; confidence: "high" | "medium" | "low" | "none"; items: Item[]; gaps: string[]; note?: string }
type Fit = { driveId: string; role: string; company: string; tier: string | null; met: string[]; unmet: string[]; unknown: string[] }
type Point = { text: string; basis: "measured" | "inferred"; evidence: string[] }
type Narrative = {
  summary: string; strengths: Point[]; developmentAreas: Point[]
  careerPathways: { role: string; fit: "strong" | "possible" | "stretch"; rationale: string; basis: "measured" | "inferred"; evidence: string[] }[]
  recommendations: { title: string; action: string; priority: "high" | "medium" | "low"; area: string }[]
  dataGaps: string[]; cautions: string[]
}
type Data = {
  aiConfigured: boolean
  evidence: { dimensions: Dim[]; jobFit: Fit[]; context: { documents: { verified: number; pending: number; rejected: number }; academicsVerified: boolean } }
  report: { narrative: Narrative; model: string; createdAt: string; stale: boolean } | null
  history: { id: string; createdAt: string; scores: Record<string, number> }[]
}

const KIND: Record<Dim["kind"], string> = { measured: "Measured", declared: "Self-declared", none: "No data" }
const CONF: Record<Dim["confidence"], string> = { high: "High confidence", medium: "Medium confidence", low: "Low confidence", none: "" }
const tone = (s: number) => (s >= 70 ? "bg-emerald-500" : s >= 50 ? "bg-amber-500" : "bg-red-500")
const radarConfig = { score: { label: "Score", color: "var(--chart-2)" } } satisfies ChartConfig

function Bar({ score }: { score: number }) {
  return <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100}><div className={`h-full rounded-full ${tone(score)}`} style={{ width: `${score}%` }} /></div>
}
function Basis({ b }: { b: "measured" | "inferred" }) {
  return <Badge variant={b === "measured" ? "default" : "outline"} className="shrink-0 text-[0.65rem]">{b === "measured" ? "Measured" : "Inferred"}</Badge>
}

/** The Student 360° dashboard: separate scores per dimension, what each rests on, what is missing, then the AI's reading of it. */
export function StudentIntelligence({ studentId }: { studentId: string }) {
  const { data, error, reload } = useApi<Data>(`/api/students/${studentId}/intelligence`)
  const [busy, setBusy] = React.useState(false)
  async function generate() {
    setBusy(true)
    try { await api(`/api/students/${studentId}/intelligence/generate`, { method: "POST" }); toast.success("Analysis updated"); reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  if (error) return <Alert variant="destructive"><AlertTitle>Could not load the analysis</AlertTitle><AlertDescription>{error instanceof Error ? error.message : "Try again"}</AlertDescription></Alert>
  if (!data) return <div className="flex flex-col gap-3"><Skeleton className="h-20" /><Skeleton className="h-64" /></div>

  const { evidence: ev, report } = data
  const scored = ev.dimensions.filter((d) => d.score !== null)
  const personality = ev.dimensions.find((d) => d.key === "personality")
  const radar = (personality?.items ?? []).map((i) => ({ trait: titleCase(i.label), score: Number(i.value) }))
  const n = report?.narrative

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-semibold"><SparklesIcon className="size-4 text-primary" aria-hidden />Student 360° intelligence</div>
          <p className="text-xs text-muted-foreground">Scores come from records and assessments. The written analysis is AI-generated from them{report ? `, last updated ${fmtDateTime(report.createdAt)}` : ""}.</p>
        </div>
        {report?.stale && <Badge variant="secondary">New data since this analysis</Badge>}
        <Button size="sm" onClick={generate} disabled={busy || !data.aiConfigured}>{busy ? <Spinner /> : <SparklesIcon />}{report ? "Refresh analysis" : "Generate analysis"}</Button>
      </div>
      {!data.aiConfigured && <Alert><InfoIcon /><AlertTitle>AI analysis is not switched on</AlertTitle><AlertDescription>The scores below work without it. To get the written analysis, add a Groq key as <code>GROQ_API_KEY</code> in the server settings (<code>.env</code>) and restart the server.</AlertDescription></Alert>}
      <Alert><InfoIcon /><AlertTitle>How to read this</AlertTitle><AlertDescription>Each dimension has its own score and is never merged into one grade. “Measured” comes from verified records or assessments, “Self-declared” is what the student wrote, and “No data” means nothing is known yet. Personality describes preferences and is never used to decide eligibility or hiring.</AlertDescription></Alert>

      <div className="grid gap-3 lg:grid-cols-5">
        <section className="rounded-xl border bg-card p-3 lg:col-span-3">
          <h3 className="mb-2 text-sm font-semibold">Dimension scores</h3>
          {scored.length === 0 ? <p className="text-sm text-muted-foreground">No scored dimension yet. Marks or assessment results are needed.</p> : (
            <ul className="flex flex-col gap-3">
              {scored.map((d) => (
                <li key={d.key}>
                  <div className="flex items-center justify-between gap-2 text-sm"><span className="font-medium">{d.label}</span><span className="tabular-nums">{d.score}<span className="text-xs text-muted-foreground"> / 100</span></span></div>
                  <Bar score={d.score!} />
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs text-muted-foreground"><Badge variant="default" className="text-[0.65rem]">{KIND[d.kind]}</Badge>{CONF[d.confidence]}{d.key === "academics" && !ev.context.academicsVerified && <span>· marks not yet verified</span>}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-xl border bg-card p-3 lg:col-span-2">
          <h3 className="mb-1 text-sm font-semibold">Personality (Big Five)</h3>
          {radar.length ? (<>
            <ChartContainer config={radarConfig} className="mx-auto aspect-square max-h-56">
              <RadarChart data={radar}><PolarGrid /><PolarAngleAxis dataKey="trait" tick={{ fontSize: 10 }} /><Radar dataKey="score" fill="var(--color-score)" fillOpacity={0.35} stroke="var(--color-score)" /><ChartTooltip content={<ChartTooltipContent />} /></RadarChart>
            </ChartContainer>
            <p className="text-center text-xs text-muted-foreground">0 to 100 per trait. Descriptive only.</p>
          </>) : <p className="text-sm text-muted-foreground">{personality?.gaps[0] ?? "Not available."}</p>}
        </section>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ev.dimensions.map((d) => (
          <section key={d.key} className="flex flex-col gap-2 rounded-xl border bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-1"><h3 className="text-sm font-semibold">{d.label}</h3><Badge variant={d.kind === "measured" ? "default" : d.kind === "declared" ? "secondary" : "outline"}>{KIND[d.kind]}</Badge></div>
            {d.items.length > 0 && <ul className="flex flex-col gap-0.5 text-sm">{d.items.slice(0, 6).map((i, k) => <li key={k} className="flex justify-between gap-2"><span className="min-w-0 truncate text-muted-foreground" title={i.label}>{i.label}</span><span className="shrink-0 tabular-nums">{i.value ?? "—"}{!i.verified && d.kind !== "none" && <span title="Not independently verified" className="text-muted-foreground"> *</span>}</span></li>)}{d.items.length > 6 && <li className="text-xs text-muted-foreground">and {d.items.length - 6} more</li>}</ul>}
            {d.gaps.length > 0 && <ul className="mt-auto flex flex-col gap-0.5 text-xs text-amber-700 dark:text-amber-400">{d.gaps.map((g, k) => <li key={k} className="flex gap-1"><AlertTriangleIcon className="mt-0.5 size-3 shrink-0" aria-hidden />{g}</li>)}</ul>}
          </section>
        ))}
      </div>

      <section className="rounded-xl border bg-card p-3">
        <h3 className="mb-1 text-sm font-semibold">Comparison with open drives</h3>
        <p className="mb-2 text-xs text-muted-foreground">A plain check against each published drive’s thresholds, using the marks available now. It is only a guide: eligibility is decided by the drive’s rules once the student is onboarded.</p>
        {ev.jobFit.length === 0 ? <p className="text-sm text-muted-foreground">No open drives right now.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th className="pb-1 pr-3 font-normal">Drive</th><th className="pb-1 pr-3 font-normal">Meets</th><th className="pb-1 pr-3 font-normal">Does not meet</th><th className="pb-1 font-normal">Unknown</th></tr></thead>
            <tbody>{ev.jobFit.map((f) => (
              <tr key={f.driveId} className="border-t align-top"><td className="py-1.5 pr-3"><div className="font-medium">{f.role}</div><div className="text-xs text-muted-foreground">{f.company}{f.tier ? ` · ${titleCase(f.tier)}` : ""}</div></td>
                <td className="py-1.5 pr-3 text-xs">{f.met.length ? f.met.map((m, i) => <div key={i} className="text-emerald-700 dark:text-emerald-400">✓ {m}</div>) : "—"}</td>
                <td className="py-1.5 pr-3 text-xs">{f.unmet.length ? f.unmet.map((m, i) => <div key={i} className="text-destructive">✗ {m}</div>) : "—"}</td>
                <td className="py-1.5 text-xs text-muted-foreground">{f.unknown.length ? f.unknown.join("; ") : "—"}</td></tr>
            ))}</tbody></table></div>
        )}
      </section>

      {n ? (
        <section className="flex flex-col gap-3 rounded-xl border bg-card p-3">
          <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">AI analysis</h3><Badge variant="outline" className="text-[0.65rem]">{report!.model}</Badge></div>
          <p className="text-sm leading-relaxed">{n.summary}</p>
          <div className="grid gap-3 md:grid-cols-2">
            {([["Strengths", n.strengths], ["Development areas", n.developmentAreas]] as const).map(([title, list]) => (
              <div key={title}><h4 className="pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
                {list.length === 0 ? <p className="text-sm text-muted-foreground">Nothing to report from the evidence.</p> : <ul className="flex flex-col gap-2">{list.map((p, i) => <li key={i} className="flex gap-2 text-sm"><Basis b={p.basis} /><div><div>{p.text}</div>{p.evidence.length > 0 && <div className="text-xs text-muted-foreground">Based on: {p.evidence.join("; ")}</div>}</div></li>)}</ul>}
              </div>
            ))}
          </div>
          {n.careerPathways.length > 0 && (
            <div><h4 className="pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Possible career pathways</h4>
              <div className="grid gap-2 sm:grid-cols-2">{n.careerPathways.map((p, i) => (
                <div key={i} className="rounded-lg border p-2.5 text-sm"><div className="flex flex-wrap items-center gap-1.5"><span className="font-medium">{p.role}</span><Badge variant={p.fit === "strong" ? "default" : p.fit === "possible" ? "secondary" : "outline"}>{titleCase(p.fit)} evidence</Badge><Basis b={p.basis} /></div><p className="pt-1 text-muted-foreground">{p.rationale}</p>{p.evidence.length > 0 && <div className="pt-1 text-xs text-muted-foreground">Based on: {p.evidence.join("; ")}</div>}</div>
              ))}</div>
            </div>
          )}
          {n.recommendations.length > 0 && (
            <div><h4 className="pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recommendations</h4>
              <ul className="flex flex-col gap-2">{[...n.recommendations].sort((a, b) => ["high", "medium", "low"].indexOf(a.priority) - ["high", "medium", "low"].indexOf(b.priority)).map((r, i) => (
                <li key={i} className="flex gap-2 text-sm"><Badge variant={r.priority === "high" ? "destructive" : r.priority === "medium" ? "secondary" : "outline"} className="shrink-0">{titleCase(r.priority)}</Badge><div><div className="font-medium">{r.title}</div><div className="text-muted-foreground">{r.action}</div></div></li>
              ))}</ul>
            </div>
          )}
          {n.dataGaps.length > 0 && <div><h4 className="pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Not enough data</h4><ul className="list-disc pl-5 text-sm text-muted-foreground">{n.dataGaps.map((g, i) => <li key={i}>{g}</li>)}</ul></div>}
          {n.cautions.length > 0 && <p className="border-t pt-2 text-xs text-muted-foreground">{n.cautions.join(" ")}</p>}
        </section>
      ) : data.aiConfigured && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No AI analysis yet. Press “Generate analysis”.</p>}

      {data.history.length > 1 && (
        <section className="rounded-xl border bg-card p-3">
          <h3 className="mb-1 text-sm font-semibold">Earlier readings</h3>
          <ul className="flex flex-col gap-1 text-xs text-muted-foreground">{data.history.map((h) => <li key={h.id}>{fmtDateTime(h.createdAt)}: {Object.entries(h.scores).map(([k, v]) => `${titleCase(k)} ${v}`).join(", ") || "no scored dimensions"}</li>)}</ul>
        </section>
      )}
    </div>
  )
}
