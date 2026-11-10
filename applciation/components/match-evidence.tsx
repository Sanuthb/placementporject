"use client"

import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"

export type Param = { label: string; weight: number; value: number | null; note: string; points?: number }
export type Req = { level: string; text: string; status: string; evidence: string[]; note?: string | null }
const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = { MET: { label: "Met", variant: "default" }, PARTIAL: { label: "Partly", variant: "secondary" }, MISSING: { label: "Missing", variant: "destructive" }, UNKNOWN: { label: "Needs a person", variant: "outline" } }

/** The score by area and each requirement with what backs it. Shared by the staff, student and recruiter views so everyone sees the same evidence. */
export function MatchEvidence({ parameters, requirements }: { parameters: Param[]; requirements: Req[] }) {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex flex-col gap-2">
        <h3 className="font-medium">Score by area</h3>
        {parameters.map((p) => (
          <div key={p.label} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2"><span className="w-44 shrink-0">{p.label} <span className="text-xs text-muted-foreground">({p.weight}%)</span></span><Progress value={p.value === null ? 0 : Math.round(p.value * 100)} /><span className="w-12 text-right text-xs text-muted-foreground">{p.value === null ? "n/a" : `${Math.round(p.value * 100)}%`}</span></div>
            <span className="pl-44 text-xs text-muted-foreground">{p.note}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="font-medium">Requirements and what backs them</h3>
        {requirements.map((r, i) => (
          <div key={i} className="flex flex-col gap-0.5 rounded-md border p-2">
            <div className="flex flex-wrap items-center gap-2"><Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge><span className="font-medium">{r.text}</span><span className="text-xs text-muted-foreground">{r.level === "MANDATORY" ? "required" : "preferred"}</span></div>
            {r.evidence.length > 0 && <span className="text-xs text-muted-foreground">{r.evidence.join("; ")}</span>}
            {r.note && <span className="text-xs text-muted-foreground">{r.note}</span>}
          </div>
        ))}
        {requirements.length === 0 && <span className="text-muted-foreground">No requirements listed.</span>}
      </div>
    </div>
  )
}
