"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { OptionSelect } from "@/components/option-select"
import { api, ApiClientError, toastError } from "@/lib/web/api"
import { fmtDateTime, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Row = { id: string; category: string; subject: string; status: string; priority: string; createdAt: string; institution?: never; college: { id: string; name: string }; assignee: { id: string; name: string | null } | null; entryCount: number }
type Page = { items: Row[]; page: number; total: number; totalPages: number }
type Metrics = { open: number; inProgress: number; resolvedInWindow: number; windowDays: number; unassigned: number; oldestOpenAgeHours: number | null; medianResolutionHours: number | null; basis: string }
const PRIORITY: Record<string, { label: string; className: string }> = {
  LOW: { label: "Low", className: "" }, NORMAL: { label: "Normal", className: "" }, HIGH: { label: "High", className: "border-amber-500 bg-amber-100 text-amber-900" }, URGENT: { label: "Urgent", className: "border-red-500 bg-red-100 text-red-900" },
}
const hrs = (h: number | null) => (h === null ? "—" : h < 48 ? `${h} h` : `${Math.round(h / 24)} days`)
type Entry = { id: string; kind: "REPLY" | "NOTE" | "EVENT"; body: string; at: string; by: { name: string | null } | null }
type Detail = { id: string; institution: { id: string; name: string }; category: string; subject: string; status: string; priority: string; createdAt: string; requester: { name: string; role: string } | null; assignee: { id: string; name: string | null } | null; entries: Entry[] }

/**
 * Platform support requests. Requests come from institution administrators. Personal details in request text are masked by the API
 * before they get here; internal notes are visible to platform administrators only. All checks are in the API; this page only displays.
 */
export default function PlatformSupportPage() {
  const [q, setQ] = React.useState(""); const [dq, setDq] = React.useState("")
  const [f, setF] = React.useState({ status: "", institution: "", assignee: "", priority: "" }); const [page, setPage] = React.useState(1)
  const [open, setOpen] = React.useState<string | null>(null)
  React.useEffect(() => { const t = setTimeout(() => { setDq(q.trim()); setPage(1) }, 300); return () => clearTimeout(t) }, [q])
  const set = (k: keyof typeof f) => (v: string) => { setF((x) => ({ ...x, [k]: v })); setPage(1) }
  const metrics = useApi<Metrics>("/api/platform/support/metrics")
  const { data: insts } = useApi<{ items: { id: string; name: string }[] }>("/api/platform/institutions", { pageSize: 100, sort: "name", order: "asc" })
  const { data, error, loading, reload } = useApi<Page>("/api/platform/support", { q: dq || undefined, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), page, pageSize: 20 })

  if (error instanceof ApiClientError && [401, 403].includes(error.status)) return (
    <div className="mx-auto flex max-w-md flex-col gap-3 p-6">
      <Alert variant="destructive"><AlertTitle>Platform administrators only</AlertTitle><AlertDescription>{error.status === 401 ? "Sign in to continue." : error.message}</AlertDescription></Alert>
      <Button render={<Link href="/platform" />}>Go to platform sign-in</Button>
    </div>
  )
  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex items-start justify-between gap-3">
        <div><h1 className="text-2xl font-semibold tracking-tight">Support requests</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Requests from institution administrators. Personal details are hidden.</p></div>
        
      </header>
      <section aria-label="Support summary" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {([["Open", metrics.data?.open], ["In progress", metrics.data?.inProgress], ["Unassigned", metrics.data?.unassigned], [`Resolved, last ${metrics.data?.windowDays ?? 30} days`, metrics.data?.resolvedInWindow], ["Median time to resolve", metrics.data ? hrs(metrics.data.medianResolutionHours) : undefined], ["Oldest open request", metrics.data ? hrs(metrics.data.oldestOpenAgeHours) : undefined]] as [string, number | string | undefined][]).map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-card p-3 shadow-xs"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-xl font-semibold tabular-nums">{metrics.error ? <span className="text-sm font-normal text-muted-foreground">Unavailable</span> : value === undefined ? <Skeleton className="h-6 w-12" /> : value}</div></div>
        ))}
      </section>
      {metrics.data && <p className="-mt-3 text-xs text-muted-foreground">{metrics.data.basis}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label="Search support requests" className="w-64" placeholder="Search subject or institution" value={q} onChange={(e) => setQ(e.target.value)} />
        <OptionSelect className="w-40" placeholder="Status" value={f.status} onChange={set("status")} options={[{ value: "", label: "Any status" }, ...["OPEN", "IN_PROGRESS", "RESOLVED"].map((v) => ({ value: v, label: titleCase(v) }))]} />
        <OptionSelect className="w-40" placeholder="Priority" value={f.priority} onChange={set("priority")} options={[{ value: "", label: "Any priority" }, ...["URGENT", "HIGH", "NORMAL", "LOW"].map((v) => ({ value: v, label: PRIORITY[v].label }))]} />
        <OptionSelect className="w-52" placeholder="Institution" value={f.institution} onChange={set("institution")} options={[{ value: "", label: "All institutions" }, ...(insts?.items ?? []).map((i) => ({ value: i.id, label: i.name }))]} />
        <OptionSelect className="w-40" placeholder="Assigned" value={f.assignee} onChange={set("assignee")} options={[{ value: "", label: "Anyone" }, { value: "me", label: "Assigned to me" }, { value: "none", label: "Unassigned" }]} />
      </div>
      {error ? <Alert variant="destructive"><AlertTitle>Could not load</AlertTitle><AlertDescription>{error instanceof Error ? error.message : "Try again"}</AlertDescription></Alert>
        : loading && !data ? <Skeleton className="h-48 w-full" />
        : data && data.items.length === 0 ? <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">No support requests match.</p>
        : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader><TableRow><TableHead>Request</TableHead><TableHead>Institution</TableHead><TableHead>Type</TableHead><TableHead>Assigned to</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead><TableHead>Raised</TableHead></TableRow></TableHeader>
              <TableBody>
                {data?.items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell><button type="button" className="font-medium underline-offset-4 hover:underline" onClick={() => setOpen(r.id)}>{r.subject}</button></TableCell>
                    <TableCell>{r.college.name}</TableCell><TableCell>{titleCase(r.category)}</TableCell><TableCell>{r.assignee?.name ?? "Unassigned"}</TableCell>
                    <TableCell><Badge variant="outline" className={PRIORITY[r.priority]?.className}>{PRIORITY[r.priority]?.label ?? titleCase(r.priority)}</Badge></TableCell><TableCell><Badge variant={r.status === "RESOLVED" ? "secondary" : "outline"}>{titleCase(r.status)}</Badge></TableCell><TableCell>{fmtDateTime(r.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{data.total} requests · page {data.page} of {data.totalPages}</span>
          <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>Next</Button></div></div>
      )}
      <RequestDialog id={open} onClose={() => setOpen(null)} onChanged={reload} />
    </div>
  )
}

function RequestDialog({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { data, loading, reload } = useApi<Detail>(id ? `/api/platform/support/${id}` : null)
  const { data: me } = useApi<{ id?: string; adminId?: string }>(id ? "/api/platform/me" : null)
  const [text, setText] = React.useState(""); const [busy, setBusy] = React.useState(false)
  const run = async (path: string, body: unknown, ok: string, clear = false) => {
    setBusy(true)
    try { await api(`/api/platform/support/${id}/${path}`, { method: "POST", body }); toast.success(ok); if (clear) setText(""); reload(); onChanged() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  const myId = me?.id ?? me?.adminId
  const resolved = data?.status === "RESOLVED"
  return (
    <Dialog open={!!id} onOpenChange={(o) => { if (!o) { setText(""); onClose() } }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{data?.subject ?? "Support request"}</DialogTitle>
          <DialogDescription>{data ? <>{data.institution.name} · {titleCase(data.category)} · <Badge variant="outline">{titleCase(data.status)}</Badge>{data.requester ? ` · from ${data.requester.name}` : ""}</> : "Loading"}</DialogDescription></DialogHeader>
        {loading && !data ? <Skeleton className="h-40" /> : data && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">Personal details in the text are hidden. Internal notes are never shown to the institution.</p>
            <ol className="flex flex-col gap-2">
              {data.entries.map((e) => (
                <li key={e.id} className={`rounded-md border p-3 text-sm ${e.kind === "NOTE" ? "border-amber-500/50 bg-amber-500/5" : e.kind === "EVENT" ? "text-muted-foreground" : ""}`}>
                  <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">{e.kind === "NOTE" && <Badge variant="outline">Internal note</Badge>}<span>{e.by?.name ?? "System"} · {fmtDateTime(e.at)}</span></div>
                  <p className="whitespace-pre-wrap">{e.body}</p>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap items-center gap-2 text-sm"><span>Priority</span><OptionSelect className="w-36" placeholder="Priority" value={data.priority} onChange={(v) => run("priority", { priority: v }, "Priority updated")} options={["URGENT", "HIGH", "NORMAL", "LOW"].map((v) => ({ value: v, label: PRIORITY[v].label }))} /><span className="text-xs text-muted-foreground">Only the platform team sees this.</span></div>
            {resolved ? (
              <div className="flex flex-col gap-2 rounded-md border p-3">
                <p className="text-sm text-muted-foreground">This request is resolved. If the problem has come back, you can reopen it; the institution sees that it was reopened.</p>
                <Textarea aria-label="Reason for reopening" rows={2} maxLength={1000} placeholder="Why is it being reopened" value={text} onChange={(e) => setText(e.target.value)} />
                <div><Button size="sm" variant="outline" disabled={busy || text.trim().length < 3} onClick={() => run("reopen", { reason: text }, "Request reopened", true)}>Reopen request</Button></div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm">Assigned to: {data.assignee?.name ?? "nobody"}</span>
                  {myId && data.assignee?.id !== myId && <Button size="sm" variant="outline" disabled={busy} onClick={() => run("assign", { assigneeId: myId }, "Assigned to you")}>Assign to me</Button>}
                  {data.assignee && <Button size="sm" variant="ghost" disabled={busy} onClick={() => run("assign", { assigneeId: null }, "Unassigned")}>Unassign</Button>}
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => run("status", { status: data.status === "OPEN" ? "IN_PROGRESS" : "OPEN" }, "Status updated")}>Mark {data.status === "OPEN" ? "in progress" : "open"}</Button>
                </div>
                <Textarea aria-label="Message" rows={3} maxLength={5000} placeholder="Write a note or a reply" value={text} onChange={(e) => setText(e.target.value)} />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={busy || !text.trim()} onClick={() => run("notes", { message: text }, "Internal note added", true)}>Add internal note</Button>
                  <Button size="sm" variant="outline" disabled={busy || !text.trim()} onClick={() => run("reply", { message: text }, "Reply sent", true)}>Reply to institution</Button>
                  <Button size="sm" disabled={busy || !text.trim()} onClick={() => run("resolve", { message: text }, "Resolved", true)}>Resolve with this message</Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
