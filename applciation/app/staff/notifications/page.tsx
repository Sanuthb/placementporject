"use client"

import * as React from "react"
import Link from "next/link"

import { StaffNotificationChoices } from "@/components/staff-notification-choices"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { api, toastError } from "@/lib/web/api"
import { fmtDateTime } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

/** Links are stored with or without the /staff prefix, so both are accepted. */
const staffHref = (l: string) => (l.startsWith("/staff/") || l === "/staff" ? l : `/staff${l.startsWith("/") ? l : `/${l}`}`)

export default function StaffNotificationsPage() {
  const { data, reload } = useApi<{ unread: number; items: { id: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string }[] }>("/api/notifications", { limit: 50 })
  const [busy, setBusy] = React.useState(false)
  if (!data) return <Skeleton className="h-48" />
  async function readAll() {
    setBusy(true)
    try { await api("/api/notifications/read", { method: "POST", body: { all: true } }); reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  return (
    <div className="flex max-w-2xl flex-col gap-4">
    <Card>
      <CardHeader><CardTitle>Notifications</CardTitle><CardDescription>{data.unread} unread</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {data.unread > 0 && <div><Button size="sm" variant="outline" disabled={busy} onClick={readAll}>Mark all read</Button></div>}
        {data.items.map((i) => <div key={i.id} className="rounded-md border p-3"><div className="font-medium">{i.title} {!i.readAt && <Badge>New</Badge>}</div>{i.body && <div className="text-muted-foreground">{i.body}</div>}<div className="flex items-center gap-3 pt-1 text-xs text-muted-foreground">{fmtDateTime(i.createdAt)}{i.link && <Link href={staffHref(i.link)} className="font-medium text-foreground underline underline-offset-4">Open</Link>}</div></div>)}
        {data.items.length === 0 && <span className="text-muted-foreground">Nothing yet.</span>}
      </CardContent>
    </Card>
    <StaffNotificationChoices />
    </div>
  )
}
