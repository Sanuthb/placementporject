"use client"

import * as React from "react"
import { InfoIcon, MegaphoneIcon, TriangleAlertIcon, WrenchIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/web/api"
import { fmtDateTime } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Item = { id: string; kind: "MAINTENANCE" | "FEATURE" | "OUTAGE"; title: string; body: string; startsAt: string; endsAt: string | null; acknowledged: boolean }
const ICON = { MAINTENANCE: WrenchIcon, FEATURE: MegaphoneIcon, OUTAGE: TriangleAlertIcon }
const LABEL = { MAINTENANCE: "Maintenance notice", FEATURE: "New from the platform", OUTAGE: "Outage notice" }

/**
 * Notices from the platform team for this institution, shown at the top of the staff area. The server decides what this institution may see.
 * Anyone can hide a notice for the rest of this visit; an institution administrator can also confirm they have read it, which the platform team sees.
 * If the notices cannot be loaded nothing is shown: a missing banner must never get in the way of the work.
 */
export function PlatformAnnouncements({ canAcknowledge }: { canAcknowledge: boolean }) {
  const { data, reload } = useApi<{ items: Item[] }>("/api/announcements/platform")
  const [hidden, setHidden] = React.useState<string[]>([])
  const [busy, setBusy] = React.useState<string | null>(null)
  const shown = (data?.items ?? []).filter((a) => !a.acknowledged && !hidden.includes(a.id))
  if (shown.length === 0) return null

  async function confirm(id: string) {
    setBusy(id)
    try { await api(`/api/announcements/platform/${id}/ack`, { method: "POST" }); reload() } catch { setHidden((h) => [...h, id]) } finally { setBusy(null) }
  }
  return (
    <div className="flex flex-col gap-2" role="region" aria-label="Notices from the platform">
      {shown.map((a) => {
        const Icon = ICON[a.kind] ?? InfoIcon
        return (
          <Alert key={a.id} variant={a.kind === "OUTAGE" ? "destructive" : "default"}>
            <Icon />
            <AlertTitle>{a.title}</AlertTitle>
            <AlertDescription className="flex flex-col gap-2">
              <span className="whitespace-pre-wrap">{a.body}</span>
              <span className="text-xs opacity-80">{LABEL[a.kind]} · shown from {fmtDateTime(a.startsAt)}{a.endsAt ? ` until ${fmtDateTime(a.endsAt)}` : ""}</span>
              <span className="flex flex-wrap gap-2">
                {canAcknowledge && <Button size="sm" disabled={busy === a.id} onClick={() => confirm(a.id)}>I have read this</Button>}
                <Button size="sm" variant="outline" onClick={() => setHidden((h) => [...h, a.id])}>Hide for now</Button>
              </span>
            </AlertDescription>
          </Alert>
        )
      })}
    </div>
  )
}
