"use client"

import * as React from "react"
import { toast } from "sonner"

import { MasterTab } from "@/components/master-tab"
import { OptionSelect } from "@/components/option-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, fmtDateTime, statusVariant, titleCase } from "@/lib/web/format"
import { useLookups } from "@/lib/web/lookups"
import { useApi } from "@/lib/web/use-api"

type Tpl = { id: string; name: string; subject: string; body: string }
type Ann = { id: string; title: string; body: string; publishedAt: string; expiresAt: string | null; isActive: boolean }
type Msg = { id: string; subject: string; recipientEmail: string; status: string; error: string | null; createdAt: string; purpose: string }

export default function CommunicationsPage() {
  return (
    <Tabs defaultValue="announcements">
      <TabsList><TabsTrigger value="announcements">Announcements</TabsTrigger><TabsTrigger value="email">Send email</TabsTrigger><TabsTrigger value="history">Sent messages</TabsTrigger><TabsTrigger value="templates">Templates</TabsTrigger><TabsTrigger value="faqs">FAQs and rules</TabsTrigger></TabsList>
      <TabsContent value="announcements"><Announcements /></TabsContent>
      <TabsContent value="email"><SendEmail /></TabsContent>
      <TabsContent value="history"><History /></TabsContent>
      <TabsContent value="templates">
        <MasterTab<Tpl> endpoint="/api/templates" addLabel="Add template"
          fields={[{ name: "name", label: "Name" }, { name: "subject", label: "Subject" }, { name: "body", label: "Message", type: "text" }]}
          columns={[{ label: "Name", cell: (r) => r.name }, { label: "Subject", cell: (r) => r.subject }, { label: "Message", cell: (r) => <span className="text-muted-foreground">{r.body.slice(0, 80)}</span> }]} />
      </TabsContent>
      <TabsContent value="faqs" className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">Students read these under Help and FAQs. Use Rule for placement policies and FAQ for common questions.</p>
        <FaqTab />
      </TabsContent>
    </Tabs>
  )
}

type Faq = { id: string; kind: string; question: string; answer: string; sortOrder: number; isPublished: boolean }

function FaqTab() {
  async function patch(id: string, body: Partial<Faq>, reload: () => void) { try { await api(`/api/faqs/${id}`, { method: "PATCH", body }); reload() } catch (e) { toastError(e) } }
  async function remove(id: string, reload: () => void) { try { await api(`/api/faqs/${id}`, { method: "DELETE" }); reload() } catch (e) { toastError(e) } }
  return (
    <MasterTab<Faq> endpoint="/api/faqs" addLabel="Add FAQ or rule"
      fields={[{ name: "kind", label: "Type", type: "select", options: [{ value: "FAQ", label: "FAQ" }, { value: "RULE", label: "Rule" }], required: true }, { name: "question", label: "Question or title" }, { name: "answer", label: "Answer", type: "textarea" }, { name: "sortOrder", label: "Order (0 shows first)", type: "number", required: false }]}
      toBody={(v) => ({ kind: v.kind, question: v.question, answer: v.answer, ...(v.sortOrder ? { sortOrder: Number(v.sortOrder) } : {}) })}
      columns={[
        { label: "Type", cell: (r) => titleCase(r.kind) },
        { label: "Question", cell: (r) => <>{r.question}<div className="line-clamp-1 text-xs text-muted-foreground">{r.answer}</div></> },
        { label: "Shown to students", cell: (r, reload) => <Switch checked={r.isPublished} onCheckedChange={(v) => patch(r.id, { isPublished: v }, reload)} aria-label="Shown to students" /> },
        { label: "", cell: (r, reload) => <Button size="sm" variant="outline" onClick={() => remove(r.id, reload)}>Delete</Button> },
      ]} />
  )
}

function Announcements() {
  const { data, reload } = useApi<Ann[]>("/api/announcements")
  const lk = useLookups()
  const [open, setOpen] = React.useState(false)
  const [dept, setDept] = React.useState("")
  const [batch, setBatch] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const exp = String(f.get("expiresAt") ?? "")
    setBusy(true)
    try { await api("/api/announcements", { method: "POST", body: { title: f.get("title"), body: f.get("body"), targetDepartmentIds: dept ? [dept] : [], targetBatchIds: batch ? [batch] : [], ...(exp ? { expiresAt: new Date(`${exp}T23:59:59`).toISOString() } : {}) } }); toast.success("Announcement published"); setOpen(false); reload() } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  async function toggle(a: Ann) { try { await api(`/api/announcements/${a.id}`, { method: "PATCH", body: { isActive: !a.isActive } }); reload() } catch (e) { toastError(e) } }
  if (!data) return <Skeleton className="h-40" />
  return (
    <div className="flex flex-col gap-3">
      <div><Button onClick={() => setOpen(true)}>New announcement</Button></div>
      <Table>
        <TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Published</TableHead><TableHead>Expires</TableHead><TableHead>State</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
        <TableBody>
          {data.map((a) => <TableRow key={a.id}><TableCell>{a.title}<div className="text-xs text-muted-foreground">{a.body.slice(0, 90)}</div></TableCell><TableCell>{fmtDate(a.publishedAt)}</TableCell><TableCell>{fmtDate(a.expiresAt)}</TableCell><TableCell><Badge variant={a.isActive ? "default" : "outline"}>{a.isActive ? "Visible" : "Hidden"}</Badge></TableCell><TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => toggle(a)}>{a.isActive ? "Hide" : "Show"}</Button></TableCell></TableRow>)}
          {data.length === 0 && <TableRow><TableCell colSpan={5} className="text-muted-foreground">No announcements yet.</TableCell></TableRow>}
        </TableBody>
      </Table>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New announcement</DialogTitle></DialogHeader>
          <form onSubmit={create}>
            <FieldGroup>
              <Field><FieldLabel htmlFor="title">Title</FieldLabel><Input id="title" name="title" minLength={3} required /></Field>
              <Field><FieldLabel htmlFor="body">Message</FieldLabel><Textarea id="body" name="body" minLength={3} required /></Field>
              <Field><FieldLabel>Department (optional)</FieldLabel><OptionSelect className="w-full" value={dept} onChange={setDept} options={[{ value: "", label: "Everyone" }, ...lk.departments]} placeholder="Everyone" /></Field>
              <Field><FieldLabel>Batch (optional)</FieldLabel><OptionSelect className="w-full" value={batch} onChange={setBatch} options={[{ value: "", label: "All batches" }, ...lk.batches]} placeholder="All batches" /></Field>
              <Field><FieldLabel htmlFor="expiresAt">Hide after (optional)</FieldLabel><Input id="expiresAt" name="expiresAt" type="date" /></Field>
            </FieldGroup>
            <DialogFooter className="mt-4"><Button type="submit" disabled={busy}>{busy && <Spinner />}Publish</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SendEmail() {
  const lk = useLookups()
  const tpls = useApi<Tpl[]>("/api/templates")
  const [tpl, setTpl] = React.useState("")
  const [dept, setDept] = React.useState("")
  const [batch, setBatch] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!dept && !batch) { toast.error("Choose a department or a batch to send to"); return }
    const f = new FormData(e.currentTarget)
    setBusy(true)
    try {
      const body = { ...(tpl ? { templateId: tpl } : { subject: f.get("subject"), message: f.get("message") }), ...(dept ? { departmentId: dept } : {}), ...(batch ? { batchId: batch } : {}) }
      const r = await api<{ approvalRequired?: boolean; sent?: number }>("/api/communications/email", { method: "POST", body })
      toast.success(r?.approvalRequired ? "Sent for approval" : `Email sent${r?.sent !== undefined ? ` to ${r.sent} students` : ""}`)
    } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>Email students</CardTitle><CardDescription>Up to 500 recipients per send, 10 sends an hour. Your college may require approval.</CardDescription></CardHeader>
      <CardContent>
        <form onSubmit={send}>
          <FieldGroup>
            <Field><FieldLabel>Use a template (optional)</FieldLabel><OptionSelect className="w-full" value={tpl} onChange={setTpl} options={[{ value: "", label: "Write my own" }, ...(tpls.data ?? []).map((t) => ({ value: t.id, label: t.name }))]} placeholder="Write my own" /></Field>
            {!tpl && <><Field><FieldLabel htmlFor="subject">Subject</FieldLabel><Input id="subject" name="subject" minLength={3} required /></Field><Field><FieldLabel htmlFor="message">Message</FieldLabel><Textarea id="message" name="message" minLength={3} required /></Field></>}
            <Field><FieldLabel>Department</FieldLabel><OptionSelect className="w-full" value={dept} onChange={setDept} options={[{ value: "", label: "Any" }, ...lk.departments]} placeholder="Any" /></Field>
            <Field><FieldLabel>Batch</FieldLabel><OptionSelect className="w-full" value={batch} onChange={setBatch} options={[{ value: "", label: "Any" }, ...lk.batches]} placeholder="Any" /></Field>
            <Field><Button type="submit" disabled={busy}>{busy && <Spinner />}Send email</Button></Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}

function History() {
  const { data } = useApi<{ items: Msg[] }>("/api/communications/messages", { limit: 100 })
  if (!data) return <Skeleton className="h-40" />
  return (
    <Table>
      <TableHeader><TableRow><TableHead>Subject</TableHead><TableHead>To</TableHead><TableHead>Status</TableHead><TableHead>When</TableHead></TableRow></TableHeader>
      <TableBody>
        {data.items.map((m) => <TableRow key={m.id}><TableCell>{m.subject}<div className="text-xs text-muted-foreground">{titleCase(m.purpose)}</div></TableCell><TableCell>{m.recipientEmail}</TableCell><TableCell><Badge variant={statusVariant(m.status === "SENT" ? "VERIFIED" : "REJECTED")}>{titleCase(m.status)}</Badge>{m.error && <div className="text-xs text-destructive">{m.error}</div>}</TableCell><TableCell>{fmtDateTime(m.createdAt)}</TableCell></TableRow>)}
        {data.items.length === 0 && <TableRow><TableCell colSpan={4} className="text-muted-foreground">No messages sent yet.</TableCell></TableRow>}
      </TableBody>
    </Table>
  )
}
