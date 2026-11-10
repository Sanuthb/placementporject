"use client"

import { Badge } from "@/components/ui/badge"
import { fmtDateTime } from "@/lib/web/format"

export type JourneyStatus = {
  current: string; label: string; next: string | null
  milestones: { key: string; label: string; reached: boolean; at: string | null; by: string | null; detail: string | null }[]
  history: { at: string; label: string; by: string | null; note: string | null }[]
}

/** The placement status steps for one application: what has happened, when and by whom, what comes next, and the full history. */
export function PlacementJourney({ status }: { status: JourneyStatus }) {
  const ended = status.current === "REJECTED" || status.current === "WITHDRAWN"
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap items-center gap-2"><span className="text-muted-foreground">Status</span><Badge variant={ended ? "destructive" : "default"}>{status.label}</Badge>{status.next && <span className="text-xs text-muted-foreground">Next: {status.next}</span>}</div>
      <ol className="flex flex-col gap-1">
        {status.milestones.filter((m) => m.key !== "REJECTED" || m.reached).map((m) => (
          <li key={m.key} className="flex flex-wrap items-baseline gap-2">
            <span aria-hidden className={m.reached ? (m.key === "REJECTED" ? "text-destructive" : "text-primary") : "text-muted-foreground"}>{m.reached ? "●" : "○"}</span>
            <span className={m.reached ? "font-medium" : "text-muted-foreground"}>{m.label}</span>
            {m.reached && <span className="text-xs text-muted-foreground">{m.at ? fmtDateTime(m.at) : ""}{m.by ? ` · ${m.by}` : ""}{m.detail ? ` · ${m.detail}` : ""}</span>}
          </li>
        ))}
      </ol>
      {status.history.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">History ({status.history.length})</summary>
          <ul className="flex flex-col gap-1 pt-2">{status.history.map((h, i) => <li key={i}>{fmtDateTime(h.at)} · {h.label}{h.by ? ` · ${h.by}` : ""}{h.note ? ` · ${h.note}` : ""}</li>)}</ul>
        </details>
      )}
    </div>
  )
}
