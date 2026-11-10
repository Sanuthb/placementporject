"use client"

import * as React from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, toastError } from "@/lib/web/api"
import { useAuth } from "@/lib/web/auth"
import { fmtDateTime, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Settings = { smsEnabled: boolean; whatsappEnabled: boolean; providers: { SMS: boolean; WHATSAPP: boolean }; dryRun: boolean }
type Log = { last7Days: { channel: string; status: string; count: number }[]; rows: { id: string; channel: string; category: string; status: string; detail: string | null; title: string; createdAt: string; student: { name: string; enrollmentNo: string } }[] }

/** Staff: switch text messages and WhatsApp on for the college, and see what was sent outside the app and what was skipped. */
export function DeliveryLog() {
  const { state } = useAuth()
  const admin = state.status === "ready" && state.profile.roles.includes("TPO_ADMIN")
  const settings = useApi<Settings>("/api/notifications/settings")
  const log = useApi<Log>("/api/notifications/deliveries")
  async function set(k: "smsEnabled" | "whatsappEnabled", v: boolean) {
    try { await api("/api/notifications/settings", { method: "PUT", body: { [k]: v } }); settings.reload(); toast.success("Saved") } catch (e) { toastError(e) }
  }
  if (!settings.data || !log.data) return <Skeleton className="h-48" />
  const s = settings.data
  return (
    <div className="flex flex-col gap-4">
      <Card className="max-w-2xl">
        <CardHeader><CardTitle>Text messages and WhatsApp</CardTitle><CardDescription>Students are messaged only if you switch a channel on here and they opt in themselves. Nothing is sent from 9 pm to 8 am, except offers.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {s.dryRun && <Alert><AlertTitle>Test mode</AlertTitle><AlertDescription>Messages are recorded but not sent.</AlertDescription></Alert>}
          {(["SMS", "WHATSAPP"] as const).map((ch) => (
            <div key={ch} className="flex flex-wrap items-center gap-3">
              <Switch id={ch} checked={ch === "SMS" ? s.smsEnabled : s.whatsappEnabled} disabled={!admin} onCheckedChange={(v) => set(ch === "SMS" ? "smsEnabled" : "whatsappEnabled", v)} />
              <label htmlFor={ch}>{ch === "SMS" ? "SMS" : "WhatsApp"}</label>
              <Badge variant={s.providers[ch] ? "secondary" : "destructive"}>{s.providers[ch] ? "Sending service ready" : "No sending service configured"}</Badge>
            </div>
          ))}
          {!admin && <p className="text-xs text-muted-foreground">Only the placement head can change this.</p>}
          <p className="text-xs text-muted-foreground">WhatsApp can deliver free text only within 24 hours of the student writing to the number, or with pre-approved templates. Until templates are set up, some messages may fail; the log below shows why.</p>
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-2">{log.data.last7Days.map((g) => <Badge key={`${g.channel}${g.status}`} variant="outline">{titleCase(g.channel)} {g.status.toLowerCase()}: {g.count}</Badge>)}{log.data.last7Days.length === 0 && <span className="text-sm text-muted-foreground">Nothing sent outside the app in the last 7 days.</span>}</div>
      <Table>
        <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Student</TableHead><TableHead>Channel</TableHead><TableHead>Message</TableHead><TableHead>Result</TableHead></TableRow></TableHeader>
        <TableBody>
          {log.data.rows.map((r) => (
            <TableRow key={r.id}><TableCell className="text-xs">{fmtDateTime(r.createdAt)}</TableCell><TableCell>{r.student.name}<div className="text-xs text-muted-foreground">{r.student.enrollmentNo}</div></TableCell><TableCell>{titleCase(r.channel)}</TableCell><TableCell className="max-w-xs truncate">{r.title}</TableCell><TableCell><Badge variant={r.status === "SENT" ? "default" : r.status === "FAILED" ? "destructive" : "secondary"}>{titleCase(r.status)}</Badge>{r.detail && <div className="text-xs text-muted-foreground">{r.detail}</div>}</TableCell></TableRow>
          ))}
          {log.data.rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-muted-foreground">No messages yet.</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  )
}
