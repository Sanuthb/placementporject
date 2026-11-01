"use client"

import * as React from "react"
import { useParams } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { AttachButton, AttachmentList, type Attachment } from "@/components/ticket-files"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { fmtDateTime, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Ticket = { id: string; subject: string; category: string; status: string; attachments: Attachment[]; messages: { id: string; body: string; createdAt: string; fromMe: boolean }[] }

export default function TicketPage() {
  const { id } = useParams<{ id: string }>()
  const { data, reload } = useApi<Ticket>(`/api/student/tickets/${id}`)
  const [text, setText] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  if (!data) return <Skeleton className="h-48" />
  async function send() {
    setBusy(true)
    try { await api(`/api/student/tickets/${id}/messages`, { method: "POST", body: { body: text.trim() } }); setText(""); reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>{data.subject}</CardTitle><CardDescription>{titleCase(data.category)} · <Badge variant="outline">{titleCase(data.status)}</Badge></CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-3">
        <AttachmentList items={data.attachments} />
        {data.messages.map((m) => (
          <div key={m.id} className={`rounded-md border p-3 text-sm ${m.fromMe ? "" : "bg-muted"}`}>
            {m.body}<div className="pt-1 text-xs text-muted-foreground">{m.fromMe ? "You" : "Placement cell"} · {fmtDateTime(m.createdAt)}</div>
          </div>
        ))}
        {data.status !== "RESOLVED" && (
          <>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a reply" />
            <div className="flex gap-2"><Button disabled={busy || !text.trim()} onClick={send}>{busy && <Spinner />}Send reply</Button><AttachButton ticketId={id} onDone={reload} /></div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
