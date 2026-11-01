"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { uploadTicketFiles } from "@/components/ticket-files"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, statusVariant, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Ticket = { id: string; category: string; subject: string; status: string; createdAt: string }
const CATEGORIES = ["DATA_CORRECTION", "APPLICATION_ISSUE", "OTHER"].map((v) => ({ value: v, label: titleCase(v) }))

export default function SupportPage() {
  const { data, reload } = useApi<Ticket[]>("/api/student/tickets")
  const [open, setOpen] = React.useState(false)
  const [category, setCategory] = React.useState("OTHER")
  const [busy, setBusy] = React.useState(false)

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setBusy(true)
    try {
      const t = await api<{ id: string }>("/api/student/tickets", { method: "POST", body: { category, subject: f.get("subject"), message: f.get("message") } })
      const files = (f.getAll("files") as File[]).filter((x) => x.size > 0)
      if (files.length) await uploadTicketFiles(t.id, files).catch((err) => toastError(err))
      toast.success("Request sent"); setOpen(false); reload()
    } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  if (!data) return <Skeleton className="h-48" />
  return (
    <div className="flex flex-col gap-4">
      <div><Button onClick={() => setOpen(true)}>New request</Button></div>
      <Table>
        <TableHeader><TableRow><TableHead>Subject</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Raised</TableHead></TableRow></TableHeader>
        <TableBody>
          {data.map((t) => <TableRow key={t.id}><TableCell><Link href={`/student/support/${t.id}`} className="font-medium underline-offset-4 hover:underline">{t.subject}</Link></TableCell><TableCell>{titleCase(t.category)}</TableCell><TableCell><Badge variant={statusVariant(t.status === "RESOLVED" ? "VERIFIED" : "PENDING")}>{titleCase(t.status)}</Badge></TableCell><TableCell>{fmtDate(t.createdAt)}</TableCell></TableRow>)}
          {data.length === 0 && <TableRow><TableCell colSpan={4} className="text-muted-foreground">No requests yet.</TableCell></TableRow>}
        </TableBody>
      </Table>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New request</DialogTitle></DialogHeader>
          <form onSubmit={create}>
            <FieldGroup>
              <Field><FieldLabel>Type</FieldLabel><OptionSelect className="w-full" value={category} onChange={setCategory} options={CATEGORIES} placeholder="Type" /></Field>
              <Field><FieldLabel htmlFor="subject">Subject</FieldLabel><Input id="subject" name="subject" minLength={3} required /></Field>
              <Field><FieldLabel htmlFor="message">Message</FieldLabel><Textarea id="message" name="message" minLength={3} required /></Field>
              <Field><FieldLabel htmlFor="files">Screenshots or documents (optional)</FieldLabel><Input id="files" name="files" type="file" multiple accept=".pdf,.png,.jpg,.jpeg" /></Field>
            </FieldGroup>
            <DialogFooter className="mt-4"><Button type="submit" disabled={busy}>{busy && <Spinner />}Send</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
