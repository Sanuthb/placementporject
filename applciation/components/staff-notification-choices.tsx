"use client"

import * as React from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { api, toastError } from "@/lib/web/api"
import { useApi } from "@/lib/web/use-api"

/** Which kinds of notification I get in the app as a staff member. */
export function StaffNotificationChoices() {
  const { data, reload } = useApi<{ key: string; label: string; mandatory: boolean; inApp: boolean }[]>("/api/notifications/preferences")
  if (!data) return <Skeleton className="h-40" />
  async function set(category: string, enabled: boolean) {
    try { await api("/api/notifications/preferences", { method: "PUT", body: { changes: [{ category, enabled }] } }); reload() } catch (e) { toastError(e) }
  }
  return (
    <Card>
      <CardHeader><CardTitle>What I am notified about</CardTitle><CardDescription>Switch off kinds you do not need. Account and offer messages always appear.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {data.map((c) => <div key={c.key} className="flex items-center gap-3"><Switch id={`sn-${c.key}`} checked={c.inApp} disabled={c.mandatory} onCheckedChange={(v) => set(c.key, v)} /><label htmlFor={`sn-${c.key}`}>{c.label}</label></div>)}
      </CardContent>
    </Card>
  )
}
