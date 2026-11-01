"use client"

import { AttachmentList, type Attachment } from "@/components/ticket-files"
import * as React from "react"
import { useParams } from "next/navigation"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { fmtDateTime, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Ticket = { attachments: Attachment[]; id: string; subject: string; category: string; status: string; section: string | null; student: { name: string; enrollmentNo: string }; assignee: { id: string; name: string } | null; messages: { id: string; body: string; createdAt: string; authorStudentId: string | null }[] }
type Staff = { id: string; name: string; isActive: boolean }

export default function StaffTicketPage() {
  const { id } = useParams<{ id: string }>()
  const { data, reload } = useApi<Ticket>(`/api/tickets/${id}`)
  const team = useApi<Staff[]>("/api/settings/staff")
  const [text, setText] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  if (!data) return <Skeleton className="h-48" />
  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true)
    try { await fn(); toast.success(ok); setText(""); reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  const resolved = data.status === "RESOLVED"
  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>{data.subject}</CardTitle>
        <CardDescription>{data.student.name} ({data.student.enrollmentNo}) · {titleCase(data.category)}{data.section ? ` · ${titleCase(data.section)}` : ""} · <Badge variant="outline">{titleCase(data.status)}</Badge></CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {team.data && <OptionSelect className="w-60" value={data.assignee?.id ?? ""} onChange={(v) => run(() => api(`/api/tickets/${id}/assign`, { method: "POST", body: { assigneeId: v || null } }), "Assignment saved")} options={[{ value: "", label: "Unassigned" }, ...team.data.filter((u) => u.isActive).map((u) => ({ value: u.id, label: u.name }))]} placeholder="Assign to" />}
        <AttachmentList items={data.attachments} />
        {data.messages.map((m) => <div key={m.id} className={`rounded-md border p-3 text-sm ${m.authorStudentId ? "bg-muted" : ""}`}>{m.body}<div className="pt-1 text-xs text-muted-foreground">{m.authorStudentId ? data.student.name : "Staff"} · {fmtDateTime(m.createdAt)}</div></div>)}
        {!resolved && (
          <>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Reply to the student" />
            <div className="flex gap-2">
              <Button disabled={busy || !text.trim()} onClick={() => run(() => api(`/api/tickets/${id}/messages`, { method: "POST", body: { body: text.trim() } }), "Reply sent")}>{busy && <Spinner />}Send reply</Button>
              <Button variant="outline" disabled={busy} onClick={() => run(() => api(`/api/tickets/${id}/resolve`, { method: "POST", body: text.trim() ? { message: text.trim() } : {} }), "Marked resolved")}>Resolve</Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
