"use client"

import * as React from "react"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { OptionSelect } from "@/components/option-select"
import { api, toastError } from "@/lib/web/api"
import { fmtDateTime, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"
import { EmptyNote, PageHeader, TableBox } from "../_components/page-header"

type Severity = "MINOR" | "MAJOR" | "CRITICAL"
type Status = "INVESTIGATING" | "IDENTIFIED" | "MONITORING" | "RESOLVED"
type Row = { id: string; title: string; severity: Severity; status: Status; startedAt: string; resolvedAt: string | null; updateCount: number; durationMinutes: number }
type Page = { items: Row[]; active: number; page: number; total: number; totalPages: number }
type Detail = { id: string; title: string; severity: Severity; status: Status; startedAt: string; resolvedAt: string | null; durationMinutes: number; updates: { id: string; status: Status; message: string; at: string; by: { name: string | null } | null }[] }

const SEVERITY: Record<Severity, { label: string; variant: "secondary" | "outline" | "destructive"; className?: string }> = {
  MINOR: { label: "Minor", variant: "secondary" }, MAJOR: { label: "Major", variant: "outline", className: "border-amber-500 bg-amber-100 text-amber-900" }, CRITICAL: { label: "Critical", variant: "destructive" },
}
const STATUS_LABEL: Record<Status, string> = { INVESTIGATING: "Investigating", IDENTIFIED: "Identified", MONITORING: "Monitoring", RESOLVED: "Resolved" }
const sev = (s: Severity) => <Badge variant={SEVERITY[s].variant} className={SEVERITY[s].className}>{SEVERITY[s].label}</Badge>
const stat = (s: Status) => <Badge variant={s === "RESOLVED" ? "secondary" : "default"}>{STATUS_LABEL[s]}</Badge>
const minutes = (m: number) => (m < 60 ? `${m} min` : m < 2880 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.round(m / 1440)} days`)

/** Incidents the platform team records by hand: an outage or a degradation, with a timeline of updates until it is resolved. Nothing here is detected automatically. */
export default function IncidentsPage() {
  const [filter, setFilter] = React.useState<"" | "ACTIVE" | "RESOLVED">("")
  const [page, setPage] = React.useState(1)
  const list = useApi<Page>("/api/platform/incidents", { status: filter || undefined, page, pageSize: 20 })
  const [open, setOpen] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState(false)

  return (
    <>
      <PageHeader title="Incidents" description="Record an outage or a slowdown, post updates as it is handled, and keep the history. Incidents are written by a person; nothing is detected or created automatically." actions={<Button onClick={() => setCreating(true)}><PlusIcon />Report an incident</Button>} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1" role="group" aria-label="Filter incidents">
          {([["", "All"], ["ACTIVE", "Active"], ["RESOLVED", "Resolved"]] as const).map(([v, label]) => <Button key={v} size="sm" variant={filter === v ? "default" : "outline"} aria-pressed={filter === v} onClick={() => { setFilter(v); setPage(1) }}>{label}</Button>)}
        </div>
        {list.data && <span className="text-sm text-muted-foreground">{list.data.active === 0 ? "No active incidents" : `${list.data.active} active`}</span>}
      </div>

      {list.error ? <Alert variant="destructive"><AlertTitle>Could not load incidents</AlertTitle><AlertDescription className="flex flex-col items-start gap-2">{list.error instanceof Error ? list.error.message : "Try again"}<Button size="sm" variant="outline" onClick={list.reload}>Try again</Button></AlertDescription></Alert>
        : !list.data ? <Skeleton className="h-40 w-full rounded-xl" />
        : list.data.items.length === 0 ? <EmptyNote>{filter ? "No incidents match." : "No incidents have been recorded."}</EmptyNote> : (
          <TableBox>
            <Table>
              <TableHeader><TableRow><TableHead>Incident</TableHead><TableHead>Severity</TableHead><TableHead>Status</TableHead><TableHead>Started</TableHead><TableHead>Duration</TableHead><TableHead>Updates</TableHead></TableRow></TableHeader>
              <TableBody>
                {list.data.items.map((i) => (
                  <TableRow key={i.id} className="cursor-pointer" onClick={() => setOpen(i.id)}>
                    <TableCell><button type="button" className="text-left font-medium text-primary underline-offset-4 hover:underline" onClick={(e) => { e.stopPropagation(); setOpen(i.id) }}>{i.title}</button></TableCell>
                    <TableCell>{sev(i.severity)}</TableCell><TableCell>{stat(i.status)}</TableCell><TableCell className="whitespace-nowrap">{fmtDateTime(i.startedAt)}</TableCell>
                    <TableCell className="whitespace-nowrap">{minutes(i.durationMinutes)}{i.status !== "RESOLVED" ? " so far" : ""}</TableCell><TableCell>{i.updateCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableBox>
        )}
      {list.data && list.data.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground"><span>{list.data.total} incident{list.data.total === 1 ? "" : "s"} · page {list.data.page} of {list.data.totalPages}</span>
          <div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={page >= list.data.totalPages} onClick={() => setPage(page + 1)}>Next</Button></div></div>
      )}

      <CreateDialog open={creating} onClose={() => setCreating(false)} onDone={(id) => { setCreating(false); list.reload(); setOpen(id) }} />
      <DetailDialog id={open} onClose={() => setOpen(null)} onChanged={list.reload} />
    </>
  )
}

function CreateDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (id: string) => void }) {
  const [v, setV] = React.useState<{ title: string; severity: Severity; message: string }>({ title: "", severity: "MINOR", message: "" })
  const [busy, setBusy] = React.useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    try { const r = await api<{ id: string }>("/api/platform/incidents", { method: "POST", body: v }); toast.success("Incident recorded"); setV({ title: "", severity: "MINOR", message: "" }); onDone(r.id) } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Report an incident</DialogTitle><DialogDescription>Say what is wrong and what you know so far. You can post updates afterwards.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field><FieldLabel htmlFor="inc-title">What is affected</FieldLabel><Input id="inc-title" required minLength={3} maxLength={160} placeholder="For example: Sign-in is slow for some users" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></Field>
            <Field><FieldLabel htmlFor="inc-sev">How serious is it</FieldLabel><OptionSelect className="w-full" placeholder="Severity" value={v.severity} onChange={(s) => setV({ ...v, severity: s as Severity })} options={[{ value: "MINOR", label: "Minor: a small part is affected" }, { value: "MAJOR", label: "Major: many people are affected" }, { value: "CRITICAL", label: "Critical: the platform is largely unusable" }]} /></Field>
            <Field><FieldLabel htmlFor="inc-msg">What you know so far</FieldLabel><Textarea id="inc-msg" required minLength={3} maxLength={2000} rows={4} value={v.message} onChange={(e) => setV({ ...v, message: e.target.value })} /></Field>
          </FieldGroup>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy && <Spinner />}Record incident</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DetailDialog({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { data, loading, error, reload } = useApi<Detail>(id ? `/api/platform/incidents/${id}` : null)
  const [status, setStatus] = React.useState<Status>("IDENTIFIED")
  const [message, setMessage] = React.useState(""); const [busy, setBusy] = React.useState(false)
  async function post(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    try { await api(`/api/platform/incidents/${id}/updates`, { method: "POST", body: { status, message } }); toast.success(status === "RESOLVED" ? "Incident resolved" : "Update posted"); setMessage(""); reload(); onChanged() } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  return (
    <Dialog open={!!id} onOpenChange={(o) => { if (!o) { setMessage(""); onClose() } }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{data?.title ?? "Incident"}</DialogTitle><DialogDescription>{data ? <span className="flex flex-wrap items-center gap-2">{sev(data.severity)}{stat(data.status)}<span>Started {fmtDateTime(data.startedAt)} · {minutes(data.durationMinutes)}{data.status !== "RESOLVED" ? " so far" : ""}</span></span> : "Loading"}</DialogDescription></DialogHeader>
        {error ? <Alert variant="destructive"><AlertTitle>Could not load this incident</AlertTitle><AlertDescription>{error instanceof Error ? error.message : "Try again"}</AlertDescription></Alert>
          : loading && !data ? <Skeleton className="h-40" /> : data && (
            <div className="flex flex-col gap-4">
              <ol className="flex flex-col gap-2" aria-label="Timeline">
                {data.updates.map((u) => <li key={u.id} className="rounded-md border p-3 text-sm"><div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">{stat(u.status)}<span>{u.by?.name ?? "Platform team"} · {fmtDateTime(u.at)}</span></div><p className="whitespace-pre-wrap">{u.message}</p></li>)}
              </ol>
              {data.status === "RESOLVED" ? <p className="text-sm text-muted-foreground">This incident is resolved and its history is closed. A new problem is a new incident.</p> : (
                <form onSubmit={post} className="flex flex-col gap-3 border-t pt-4">
                  <div className="text-sm font-medium">Post an update</div>
                  <OptionSelect className="w-56" placeholder="New status" value={status} onChange={(s) => setStatus(s as Status)} options={(["INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"] as Status[]).map((s) => ({ value: s, label: titleCase(s) }))} />
                  <Textarea aria-label="Update" required minLength={3} maxLength={2000} rows={3} placeholder="What has changed" value={message} onChange={(e) => setMessage(e.target.value)} />
                  <div><Button type="submit" disabled={busy || message.trim().length < 3}>{busy && <Spinner />}{status === "RESOLVED" ? "Resolve incident" : "Post update"}</Button></div>
                </form>
              )}
            </div>
          )}
      </DialogContent>
    </Dialog>
  )
}
