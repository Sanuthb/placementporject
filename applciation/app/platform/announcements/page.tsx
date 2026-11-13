"use client"

import * as React from "react"
import { InfoIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { OptionSelect } from "@/components/option-select"
import { api, toastError } from "@/lib/web/api"
import { fmtDateTime } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"
import { EmptyNote, PageHeader, TableBox } from "../_components/page-header"

type Kind = "MAINTENANCE" | "FEATURE" | "OUTAGE"
type State = "draft" | "scheduled" | "live" | "ended" | "cancelled"
type Item = { id: string; kind: Kind; title: string; body: string; allInstitutions: boolean; institutionIds: string[]; startsAt: string; endsAt: string | null; status: State; acknowledgements: number }
type Page = { items: Item[]; page: number; total: number; totalPages: number }
type Inst = { id: string; name: string }

const KIND: Record<Kind, string> = { MAINTENANCE: "Maintenance notice", FEATURE: "Feature announcement", OUTAGE: "Outage notice" }
const STATE: Record<State, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; className?: string }> = {
  draft: { label: "Draft", variant: "outline" }, scheduled: { label: "Scheduled", variant: "secondary" }, live: { label: "Live", variant: "default" }, ended: { label: "Ended", variant: "secondary" }, cancelled: { label: "Cancelled", variant: "destructive" },
}
/** A value for <input type="datetime-local"> in the viewer's own time zone. */
const local = (iso: string | null) => { if (!iso) return ""; const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` }

/** Notices from the platform to institutions. They appear inside the application only: nothing is e-mailed, texted or sent over WhatsApp. */
export default function AnnouncementsPage() {
  const [page, setPage] = React.useState(1)
  const list = useApi<Page>("/api/platform/announcements", { page, pageSize: 20 })
  const insts = useApi<{ items: Inst[] }>("/api/platform/institutions", { pageSize: 100, sort: "name", order: "asc" })
  const [edit, setEdit] = React.useState<Item | "new" | null>(null)
  const [confirm, setConfirm] = React.useState<{ item: Item; action: "publish" | "cancel" } | null>(null)
  const name = (id: string) => insts.data?.items.find((i) => i.id === id)?.name ?? "an institution"

  async function run() {
    if (!confirm) return
    try { await api(`/api/platform/announcements/${confirm.item.id}/${confirm.action}`, { method: "POST" }); toast.success(confirm.action === "publish" ? "Announcement published" : "Announcement cancelled"); list.reload() } catch (e) { toastError(e) } finally { setConfirm(null) }
  }

  return (
    <>
      <PageHeader title="Announcements" description="Maintenance notices, feature announcements and outage notices for institutions. They are shown inside the application only." actions={<Button onClick={() => setEdit("new")}><PlusIcon />New announcement</Button>} />
      <Alert><InfoIcon /><AlertTitle>What this does and does not do</AlertTitle><AlertDescription>An announcement is a draft until you publish it, and a published one can be cancelled but not edited. Institution administrators can confirm they have read it. Nothing is sent by email, text message or WhatsApp, and there is no delivery tracking beyond those confirmations.</AlertDescription></Alert>

      {list.error ? <Alert variant="destructive"><AlertTitle>Could not load announcements</AlertTitle><AlertDescription className="flex flex-col items-start gap-2">{list.error instanceof Error ? list.error.message : "Try again"}<Button size="sm" variant="outline" onClick={list.reload}>Try again</Button></AlertDescription></Alert>
        : !list.data ? <Skeleton className="h-40 w-full rounded-xl" />
        : list.data.items.length === 0 ? <EmptyNote>No announcements yet. Use “New announcement” to write the first one.</EmptyNote> : (
          <TableBox>
            <Table>
              <TableHeader><TableRow><TableHead>Announcement</TableHead><TableHead>Audience</TableHead><TableHead>Status</TableHead><TableHead>Shown</TableHead><TableHead>Read by</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {list.data.items.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell><div className="font-medium">{a.title}</div><div className="text-xs text-muted-foreground">{KIND[a.kind]}</div></TableCell>
                    <TableCell className="text-sm">{a.allInstitutions ? "All institutions" : a.institutionIds.length <= 2 ? a.institutionIds.map(name).join(", ") : `${a.institutionIds.length} institutions`}</TableCell>
                    <TableCell><Badge variant={STATE[a.status].variant} className={STATE[a.status].className}>{STATE[a.status].label}</Badge></TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{fmtDateTime(a.startsAt)}{a.endsAt ? ` to ${fmtDateTime(a.endsAt)}` : " onwards"}</TableCell>
                    <TableCell className="tabular-nums">{a.status === "draft" || a.status === "cancelled" ? "—" : a.acknowledgements}</TableCell>
                    <TableCell className="text-right"><div className="flex justify-end gap-2">
                      {a.status === "draft" && <><Button size="sm" variant="outline" onClick={() => setEdit(a)}>Edit</Button><Button size="sm" onClick={() => setConfirm({ item: a, action: "publish" })}>Publish</Button></>}
                      {(a.status === "scheduled" || a.status === "live") && <Button size="sm" variant="outline" onClick={() => setConfirm({ item: a, action: "cancel" })}>Cancel</Button>}
                    </div></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableBox>
        )}
      {list.data && list.data.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground"><span>{list.data.total} announcement{list.data.total === 1 ? "" : "s"} · page {list.data.page} of {list.data.totalPages}</span>
          <div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={page >= list.data.totalPages} onClick={() => setPage(page + 1)}>Next</Button></div></div>
      )}

      <EditDialog item={edit} institutions={insts.data?.items ?? []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload() }} />

      <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.action === "publish" ? "Publish" : "Cancel"} “{confirm?.item.title}”?</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.action === "publish" ? "Institutions in the audience will see it from the start time. After publishing it cannot be edited, only cancelled." : "Institutions will stop seeing it. This cannot be undone; to say something again, write a new announcement."} The change is recorded in the audit log.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep as it is</AlertDialogCancel><AlertDialogAction variant={confirm?.action === "cancel" ? "destructive" : "default"} onClick={run}>{confirm?.action === "publish" ? "Publish" : "Cancel announcement"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function EditDialog({ item, institutions, onClose, onSaved }: { item: Item | "new" | null; institutions: Inst[]; onClose: () => void; onSaved: () => void }) {
  const editing = item && item !== "new" ? item : null
  return (
    <Dialog open={!!item} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Edit draft" : "New announcement"}</DialogTitle><DialogDescription>It stays a draft until you publish it.</DialogDescription></DialogHeader>
        {item && <Form key={editing?.id ?? "new"} editing={editing} institutions={institutions} onClose={onClose} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  )
}

function Form({ editing, institutions, onClose, onSaved }: { editing: Item | null; institutions: Inst[]; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = React.useState(() => ({ kind: (editing?.kind ?? "MAINTENANCE") as Kind, title: editing?.title ?? "", body: editing?.body ?? "", all: editing?.allInstitutions ?? true, ids: editing?.institutionIds ?? [], startsAt: local(editing?.startsAt ?? new Date(Date.now() + 3_600_000).toISOString()), endsAt: local(editing?.endsAt ?? null) }))
  const [busy, setBusy] = React.useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    const body = { kind: v.kind, title: v.title, body: v.body, allInstitutions: v.all, institutionIds: v.all ? [] : v.ids, startsAt: new Date(v.startsAt).toISOString(), endsAt: v.endsAt ? new Date(v.endsAt).toISOString() : null }
    try { await api(editing ? `/api/platform/announcements/${editing.id}` : "/api/platform/announcements", { method: editing ? "PATCH" : "POST", body }); toast.success(editing ? "Draft saved" : "Draft created"); onSaved() } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <FieldGroup>
        <Field><FieldLabel>Type</FieldLabel><OptionSelect className="w-full" placeholder="Type" value={v.kind} onChange={(k) => setV({ ...v, kind: k as Kind })} options={(Object.keys(KIND) as Kind[]).map((k) => ({ value: k, label: KIND[k] }))} /></Field>
        <Field><FieldLabel htmlFor="an-title">Title</FieldLabel><Input id="an-title" required minLength={3} maxLength={140} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></Field>
        <Field><FieldLabel htmlFor="an-body">Message</FieldLabel><Textarea id="an-body" required minLength={3} maxLength={2000} rows={4} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="an-start">Shown from</FieldLabel><Input id="an-start" type="datetime-local" required value={v.startsAt} onChange={(e) => setV({ ...v, startsAt: e.target.value })} /></Field>
          <Field><FieldLabel htmlFor="an-end">Shown until (optional)</FieldLabel><Input id="an-end" type="datetime-local" value={v.endsAt} onChange={(e) => setV({ ...v, endsAt: e.target.value })} /></Field>
        </div>
        <Field>
          <FieldLabel>Who sees it</FieldLabel>
          <div className="flex gap-1" role="group" aria-label="Audience">
            <Button type="button" size="sm" variant={v.all ? "default" : "outline"} aria-pressed={v.all} onClick={() => setV({ ...v, all: true })}>All institutions</Button>
            <Button type="button" size="sm" variant={!v.all ? "default" : "outline"} aria-pressed={!v.all} onClick={() => setV({ ...v, all: false })}>Chosen institutions</Button>
          </div>
          {!v.all && (
            <div className="mt-2 max-h-40 overflow-y-auto rounded-md border p-2" role="group" aria-label="Institutions">
              {institutions.length === 0 ? <p className="text-sm text-muted-foreground">No institutions to choose from.</p> : institutions.map((i) => (
                <label key={i.id} className="flex items-center gap-2 py-1 text-sm"><Checkbox aria-label={i.name} checked={v.ids.includes(i.id)} onCheckedChange={(c) => setV({ ...v, ids: c ? [...v.ids, i.id] : v.ids.filter((x) => x !== i.id) })} />{i.name}</label>
              ))}
            </div>
          )}
        </Field>
      </FieldGroup>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || (!v.all && v.ids.length === 0)}>{busy && <Spinner />}{editing ? "Save draft" : "Create draft"}</Button></div>
    </form>
  )
}
