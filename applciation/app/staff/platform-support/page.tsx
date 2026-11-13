"use client"

import * as React from "react"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { fmtDateTime, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Row = { id: string; category: string; subject: string; status: string; createdAt: string }
type Detail = Row & { entries: { id: string; kind: string; body: string; createdAt: string; from: "you" | "platform" | "system" }[] }
const CATS = ["TECHNICAL", "ACCOUNT", "DATA", "OTHER"].map((v) => ({ value: v, label: titleCase(v) }))

/** An institution administrator's line to the platform team. Platform-side internal notes are never returned by the API, so they cannot appear here. */
export default function PlatformSupportRequestsPage() {
  const { data, reload } = useApi<{ items: Row[] }>("/api/support-requests")
  const [open, setOpen] = React.useState<string | null>(null)
  const detail = useApi<Detail>(open ? `/api/support-requests/${open}` : null)
  const [f, setF] = React.useState({ category: "TECHNICAL", subject: "", message: "" }); const [reply, setReply] = React.useState(""); const [busy, setBusy] = React.useState(false)
  const run = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); try { await fn(); toast.success(ok); reload(); detail.reload() } catch (e) { toastError(e) } finally { setBusy(false) } }
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card>
        <CardHeader><CardTitle>Contact the platform team</CardTitle><CardDescription>Ask for help with the platform itself. Do not include student contact details or ID numbers.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2"><OptionSelect className="w-40" value={f.category} onChange={(v) => setF({ ...f, category: v })} options={CATS} placeholder="Type" /><Input aria-label="Subject" className="min-w-60 flex-1" placeholder="Subject" maxLength={200} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></div>
          <Textarea aria-label="Message" rows={4} maxLength={5000} placeholder="Describe the problem" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
          <div><Button disabled={busy || f.subject.trim().length < 3 || f.message.trim().length < 3} onClick={() => run(async () => { await api("/api/support-requests", { method: "POST", body: f }); setF({ ...f, subject: "", message: "" }) }, "Request sent")}>Send request</Button></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Your requests</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2">
          {!data ? <Skeleton className="h-24" /> : data.items.length === 0 ? <p className="text-sm text-muted-foreground">No requests yet.</p> : data.items.map((r) => (
            <button key={r.id} type="button" onClick={() => setOpen(open === r.id ? null : r.id)} className="flex items-center justify-between rounded-md border p-3 text-left text-sm hover:bg-muted">
              <span className="font-medium">{r.subject}<span className="block text-xs font-normal text-muted-foreground">{titleCase(r.category)} · {fmtDateTime(r.createdAt)}</span></span><Badge variant="outline">{titleCase(r.status)}</Badge>
            </button>
          ))}
          {open && detail.data && (
            <div className="mt-2 flex flex-col gap-2 border-t pt-3">
              {detail.data.entries.map((e) => <div key={e.id} className={`rounded-md border p-3 text-sm ${e.kind === "EVENT" ? "text-muted-foreground" : ""}`}><div className="mb-1 text-xs text-muted-foreground">{e.from === "platform" ? "Platform team" : e.from === "you" ? "You" : "Update"} · {fmtDateTime(e.createdAt)}</div><p className="whitespace-pre-wrap">{e.body}</p></div>)}
              {detail.data.status !== "RESOLVED" && (<><Textarea aria-label="Reply" rows={2} maxLength={5000} placeholder="Add a reply" value={reply} onChange={(e) => setReply(e.target.value)} /><div><Button size="sm" disabled={busy || !reply.trim()} onClick={() => run(async () => { await api(`/api/support-requests/${open}/messages`, { method: "POST", body: { message: reply } }); setReply("") }, "Reply sent")}>Reply</Button></div></>)}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
