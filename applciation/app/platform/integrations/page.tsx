"use client"

import * as React from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { fmtDateTime } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"
import { denied } from "../_components/denied"

type Item = { key: string; label: string; state: string; summary: string; checked: boolean; latencyMs: number | null; onHold?: boolean; details: string[] }
type Data = { checkedAt: string; cached: boolean; throttled: boolean; counts: Record<string, number>; items: Item[] }
const LABEL: Record<string, string> = { healthy: "Healthy", configured: "Configured", missing: "Missing", disabled: "Disabled", unhealthy: "Unhealthy", unavailable: "Unavailable" }
const variant = (s: string) => (s === "healthy" ? "default" : s === "unhealthy" || s === "unavailable" ? "destructive" : "secondary") as "default" | "destructive" | "secondary"

/** Integration status: read-only. Uses the existing health checks (free, time-limited, no credential shown). */
export default function IntegrationsPage() {
  const [tick, setTick] = React.useState(0)
  const { data, error, loading } = useApi<Data>("/api/platform/integrations", { refresh: tick > 0 ? "1" : undefined, t: tick })
  const d = denied(error); if (d) return d
  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex items-start justify-between gap-3">
        <div><h1 className="text-2xl font-semibold tracking-tight">Integrations</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Read-only status of the services the platform uses. Credentials are not shown and cannot be changed here.</p></div>
        <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setTick((t) => t + 1)}>Check again</Button></div>
      </header>
      {error ? <Alert variant="destructive"><AlertTitle>Could not load</AlertTitle><AlertDescription>{error instanceof Error ? error.message : "Try again"}</AlertDescription></Alert> : loading && !data ? <Skeleton className="h-64 w-full" /> : data && (
        <>
          <p className="text-sm text-muted-foreground" data-testid="int-summary">{Object.entries(data.counts).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${LABEL[k].toLowerCase()}`).join(" · ")} · checked {fmtDateTime(data.checkedAt)}{data.throttled ? " (too soon to check again; showing the latest result)" : ""}</p>
          <div className="grid gap-3 md:grid-cols-2">
            {data.items.map((i) => (
              <Card key={i.key} data-testid={`int-${i.key}`}><CardHeader><CardTitle className="flex items-center justify-between gap-2 text-base">{i.label}<Badge variant={variant(i.state)} data-testid={`int-${i.key}-state`}>{LABEL[i.state]}{i.onHold ? " (on hold)" : ""}</Badge></CardTitle></CardHeader>
                <CardContent className="flex flex-col gap-1 text-sm"><p>{i.summary}</p>
                  {i.details.length > 0 && <ul className="list-disc pl-4 text-xs text-muted-foreground">{i.details.map((x, n) => <li key={n}>{x}</li>)}</ul>}
                  <p className="text-xs text-muted-foreground">{i.checked ? `Live check${i.latencyMs !== null ? `, ${i.latencyMs} ms` : ""}` : "No live check for this integration"}</p></CardContent></Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
