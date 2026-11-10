"use client"

import * as React from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, toastError } from "@/lib/web/api"
import { fmtDate } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Channel = "IN_APP" | "EMAIL" | "SMS" | "WHATSAPP"
type Data = {
  categories: { key: string; label: string; mandatory: boolean; channels: Record<Channel, boolean>; consentGiven: Record<string, string | null> }[]
  phone: { onFile: boolean; valid: boolean; display: string | null }
  channels: { SMS: { collegeEnabled: boolean; available: boolean }; WHATSAPP: { collegeEnabled: boolean; available: boolean } }
}
const COLS: [Channel, string][] = [["IN_APP", "In the app"], ["EMAIL", "Email"], ["SMS", "SMS"], ["WHATSAPP", "WhatsApp"]]

/** Which kinds of notification I get, and on which channels. SMS and WhatsApp stay off until I switch them on, which is my consent to be messaged. */
export function NotificationSettings() {
  const { data, reload } = useApi<Data>("/api/student/notification-settings")
  const [busy, setBusy] = React.useState<string | null>(null)
  if (!data) return <Skeleton className="h-64" />
  async function set(category: string, channel: Channel, enabled: boolean) {
    setBusy(`${category}:${channel}`)
    try { await api("/api/student/notification-settings", { method: "PUT", body: { changes: [{ category, channel, enabled }] } }); reload() } catch (e) { toastError(e) } finally { setBusy(null) }
  }
  const unavailable = (ch: Channel) => (ch === "SMS" || ch === "WHATSAPP") && (!data.channels[ch].available || !data.phone.valid)
  const why = (ch: Channel) => ch === "SMS" || ch === "WHATSAPP" ? (!data.channels[ch].collegeEnabled ? "Your college has not switched this on" : !data.channels[ch].available ? "Not available right now" : !data.phone.valid ? "Add a valid mobile number to your profile" : "") : ""
  return (
    <Card className="max-w-4xl">
      <CardHeader><CardTitle>Notification settings</CardTitle><CardDescription>Choose where each kind of message reaches you. Messages about your account and offers always appear in the app.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {(data.channels.SMS.collegeEnabled || data.channels.WHATSAPP.collegeEnabled) && (
          <Alert><AlertTitle>Text messages</AlertTitle><AlertDescription>{data.phone.valid ? `Messages go to your mobile number ${data.phone.display}. ` : "You need a valid mobile number on your profile first. "}Turning on SMS or WhatsApp means you agree to be messaged there. No messages are sent between 9 pm and 8 am, except offers. You can turn them off any time.</AlertDescription></Alert>
        )}
        <Table>
          <TableHeader><TableRow><TableHead>Kind of message</TableHead>{COLS.map(([k, l]) => <TableHead key={k} className="text-center">{l}</TableHead>)}</TableRow></TableHeader>
          <TableBody>
            {data.categories.map((c) => (
              <TableRow key={c.key}>
                <TableCell>{c.label}{c.mandatory && <div className="text-xs text-muted-foreground">Always in the app</div>}</TableCell>
                {COLS.map(([ch]) => {
                  const given = c.consentGiven[ch]
                  return (
                    <TableCell key={ch} className="text-center">
                      <Switch aria-label={`${c.label} by ${ch}`} title={why(ch)} checked={c.channels[ch]} disabled={busy === `${c.key}:${ch}` || (ch === "IN_APP" && c.mandatory) || (unavailable(ch) && !c.channels[ch])} onCheckedChange={(v) => { void set(c.key, ch, v); if (v && (ch === "SMS" || ch === "WHATSAPP")) toast.message("Saved. You agreed to receive these messages") }} />
                      {given && c.channels[ch] && <div className="text-[10px] text-muted-foreground">since {fmtDate(given)}</div>}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground">Email here means an email copy of the in-app message. Announcements and reminder emails from the placement office are controlled on the Privacy page.</p>
      </CardContent>
    </Card>
  )
}
