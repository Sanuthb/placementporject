"use client"

import * as React from "react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { api, toastError } from "@/lib/web/api"
import { fmtDateTime, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Data = { items: { type: string; id: string; title: string; body: string | null; link?: string | null; readAt: string | null; createdAt: string }[] }
type Ann = { id: string; title: string; body: string; publishedAt: string }

export default function NotificationsPage() {
  const n = useApi<Data>("/api/student/notifications")
  const a = useApi<Ann[]>("/api/student/announcements")
  const old = useApi<Ann[]>("/api/student/announcements", { archive: "true" })
  const [kind, setKind] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  async function readAll() {
    setBusy(true)
    try { await api("/api/student/notifications/read", { method: "POST", body: { all: true } }); n.reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  if (!n.data || !a.data) return <Skeleton className="h-48" />
  const kinds = [...new Set(n.data.items.map((i) => i.type.split(".")[0]))]
  const shown = n.data.items.filter((i) => !kind || i.type.split(".")[0] === kind)
  const unread = n.data.items.filter((i) => !i.readAt).length
  return (
    <div className="grid max-w-4xl gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Notifications</CardTitle><CardDescription>{unread} unread</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {unread > 0 && <div><Button size="sm" variant="outline" disabled={busy} onClick={readAll}>Mark all read</Button></div>}
          {kinds.length > 1 && <div className="flex flex-wrap gap-1"><Button size="xs" variant={kind ? "outline" : "default"} onClick={() => setKind("")}>All</Button>{kinds.map((k) => <Button key={k} size="xs" variant={kind === k ? "default" : "outline"} onClick={() => setKind(k)}>{titleCase(k)}</Button>)}</div>}
          {shown.map((i) => <div key={i.id} className="rounded-md border p-3"><div className="font-medium">{i.title} {!i.readAt && <Badge>New</Badge>}</div>{i.body && <div className="text-muted-foreground">{i.body}</div>}<div className="flex items-center gap-3 pt-1 text-xs text-muted-foreground">{fmtDateTime(i.createdAt)}{i.link?.startsWith("/student") && <Link href={i.link} className="font-medium text-foreground underline underline-offset-4">Open</Link>}</div></div>)}
          {shown.length === 0 && <span className="text-muted-foreground">Nothing yet.</span>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Announcements</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {a.data.map((i) => <div key={i.id} className="rounded-md border p-3"><div className="font-medium">{i.title}</div><div className="whitespace-pre-wrap text-muted-foreground">{i.body}</div><div className="pt-1 text-xs text-muted-foreground">{fmtDateTime(i.publishedAt)}</div></div>)}
          {a.data.length === 0 && <span className="text-muted-foreground">No announcements.</span>}
          {(old.data?.length ?? 0) > 0 && (
            <details className="pt-2"><summary className="cursor-pointer text-muted-foreground">Archive ({old.data!.length})</summary>
              <div className="flex flex-col gap-3 pt-2">{old.data!.map((i) => <div key={i.id} className="rounded-md border p-3 opacity-80"><div className="font-medium">{i.title}</div><div className="whitespace-pre-wrap text-muted-foreground">{i.body}</div><div className="pt-1 text-xs text-muted-foreground">{fmtDateTime(i.publishedAt)}</div></div>)}</div>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
