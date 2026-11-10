"use client"

import * as React from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { api, download, toastError } from "@/lib/web/api"
import { fmtDateTime } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

/** A private link that keeps a phone or desktop calendar up to date with my placement dates. */
export function CalendarFeed() {
  const { data, reload } = useApi<{ exists: boolean; createdAt: string | null; lastReadAt: string | null }>("/api/student/calendar/feed")
  const [url, setUrl] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  async function make() {
    setBusy(true)
    try { const r = await api<{ url: string }>("/api/student/calendar/feed", { method: "POST" }); setUrl(r.url); reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  async function revoke() {
    setBusy(true)
    try { await api("/api/student/calendar/feed", { method: "DELETE" }); setUrl(null); reload(); toast.success("The link no longer works") } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  return (
    <Card>
      <CardHeader><CardTitle>Keep my calendar up to date</CardTitle><CardDescription>Subscribe Google Calendar, Apple Calendar or Outlook to a private link, so drives, rounds, interviews, tests and deadlines appear there and update by themselves.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {url && (
          <Alert><AlertTitle>Your link (shown once)</AlertTitle><AlertDescription className="flex flex-col gap-2"><Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Calendar link" /><span>Add it in your calendar app as a subscription by URL. Anyone with this link can see your dates, so do not share it. Making a new link stops this one.</span><Button size="sm" variant="outline" className="self-start" onClick={() => { void navigator.clipboard.writeText(url); toast.success("Copied") }}>Copy</Button></AlertDescription></Alert>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={busy} onClick={make}>{busy && <Spinner />}{data?.exists ? "Make a new link" : "Make my calendar link"}</Button>
          {data?.exists && <Button size="sm" variant="outline" disabled={busy} onClick={revoke}>Turn the link off</Button>}
          <Button size="sm" variant="outline" onClick={() => download("/api/student/calendar", { query: { format: "ics" } }).catch(toastError)}>Download once (.ics)</Button>
        </div>
        {data?.exists && <p className="text-xs text-muted-foreground">Link made {fmtDateTime(data.createdAt)}{data.lastReadAt ? `, last used ${fmtDateTime(data.lastReadAt)}` : ", not used yet"}.</p>}
      </CardContent>
    </Card>
  )
}
