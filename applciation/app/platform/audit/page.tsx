"use client"

import * as React from "react"
import Link from "next/link"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { OptionSelect } from "@/components/option-select"
import { ApiClientError } from "@/lib/web/api"
import { fmtDateTime } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Ev = { id: string; source: "PLATFORM" | "INSTITUTION"; at: string; action: string; outcome: "success" | "failure"; actor: { id: string | null; email: string | null; name: string | null } | null; institution: { id: string; name: string | null } | null; target: { entity: string; id: string | null } | null; ip: string | null }
type Page = { items: Ev[]; page: number; total: number; totalPages: number }
type Detail = Ev & { detail: unknown; before: unknown; after: unknown; reason: string | null }
type Sort = "createdAt" | "action" | "actor" | "institution" | "source"

/**
 * Platform audit trail: read-only. It shows what platform administrators did (sign-in protection, MFA, creating or suspending institutions).
 * It never shows what an institution's own staff did; that stays in each college's log. The API does all the enforcing; this page only displays.
 */
export default function PlatformAuditPage() {
  const [q, setQ] = React.useState(""); const [dq, setDq] = React.useState("")
  const [f, setF] = React.useState({ action: "", admin: "", institution: "", outcome: "", source: "", from: "", to: "" })
  const [sort, setSort] = React.useState<Sort>("createdAt"); const [order, setOrder] = React.useState<"asc" | "desc">("desc"); const [page, setPage] = React.useState(1)
  const [open, setOpen] = React.useState<string | null>(null)
  React.useEffect(() => { const t = setTimeout(() => { setDq(q.trim()); setPage(1) }, 300); return () => clearTimeout(t) }, [q])
  const set = (k: keyof typeof f) => (v: string) => { setF((x) => ({ ...x, [k]: v })); setPage(1) }
  const { data: facets } = useApi<{ actions: string[]; admins: { id: string; email: string; name: string }[] }>("/api/platform/audit-logs/facets")
  const { data: insts } = useApi<{ items: { id: string; name: string }[] }>("/api/platform/institutions", { pageSize: 100, sort: "name", order: "asc" })
  const { data, error, loading } = useApi<Page>("/api/platform/audit-logs", { q: dq || undefined, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), sort, order, page, pageSize: 25 })
  const { data: detail, loading: dLoading } = useApi<Detail>(open ? `/api/platform/audit-logs/${open}` : null)
  const sortBy = (k: Sort) => { if (k === sort) setOrder(order === "asc" ? "desc" : "asc"); else { setSort(k); setOrder(k === "createdAt" ? "desc" : "asc") } setPage(1) }
  const arrow = (k: Sort) => (k === sort ? (order === "asc" ? " ▲" : " ▼") : "")

  if (error instanceof ApiClientError && [401, 403].includes(error.status)) return (
    <div className="mx-auto flex max-w-md flex-col gap-3 p-6">
      <Alert variant="destructive"><AlertTitle>Platform administrators only</AlertTitle><AlertDescription>{error.status === 401 ? "Sign in to continue." : error.message}</AlertDescription></Alert>
      <Button render={<Link href="/platform" />}>Go to platform sign-in</Button>
    </div>
  )
  const items = data?.items
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-8">
      <header className="flex items-start justify-between gap-3">
        <div><h1 className="text-xl font-semibold tracking-tight">Platform audit log</h1><p className="text-sm text-muted-foreground">Read-only record of platform administrator actions. Institution staff activity is not shown here.</p></div>
        <Button variant="outline" size="sm" render={<Link href="/platform" />}>Institutions</Button>
      </header>
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label="Search audit events" className="w-64" placeholder="Search event, administrator, institution, target" value={q} onChange={(e) => setQ(e.target.value)} />
        <OptionSelect className="w-52" placeholder="Event type" value={f.action} onChange={set("action")} options={[{ value: "", label: "All event types" }, ...(facets?.actions ?? []).map((a) => ({ value: a, label: a }))]} />
        <OptionSelect className="w-52" placeholder="Administrator" value={f.admin} onChange={set("admin")} options={[{ value: "", label: "All administrators" }, ...(facets?.admins ?? []).map((a) => ({ value: a.id, label: a.email }))]} />
        <OptionSelect className="w-52" placeholder="Institution" value={f.institution} onChange={set("institution")} options={[{ value: "", label: "All institutions" }, ...(insts?.items ?? []).map((i) => ({ value: i.id, label: i.name }))]} />
        <OptionSelect className="w-36" placeholder="Outcome" value={f.outcome} onChange={set("outcome")} options={[{ value: "", label: "Any outcome" }, { value: "success", label: "Succeeded" }, { value: "failure", label: "Failed" }]} />
        <OptionSelect className="w-40" placeholder="Kind" value={f.source} onChange={set("source")} options={[{ value: "", label: "All kinds" }, { value: "PLATFORM", label: "Administrator security" }, { value: "INSTITUTION", label: "Institution changes" }]} />
        <Input aria-label="From date" type="date" className="w-40" value={f.from} onChange={(e) => set("from")(e.target.value)} />
        <Input aria-label="To date" type="date" className="w-40" value={f.to} onChange={(e) => set("to")(e.target.value)} />
        <Button variant="ghost" size="sm" onClick={() => { setQ(""); setF({ action: "", admin: "", institution: "", outcome: "", source: "", from: "", to: "" }); setPage(1) }}>Clear</Button>
      </div>
      {error ? <Alert variant="destructive"><AlertTitle>Could not load</AlertTitle><AlertDescription>{error instanceof Error ? error.message : "Try again"}</AlertDescription></Alert>
        : loading && !data ? <Skeleton className="h-48 w-full" />
        : items && items.length === 0 ? <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">No audit events match.</p>
        : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader><TableRow>
                <TableHead><button type="button" onClick={() => sortBy("createdAt")}>When{arrow("createdAt")}</button></TableHead>
                <TableHead><button type="button" onClick={() => sortBy("action")}>Event{arrow("action")}</button></TableHead>
                <TableHead><button type="button" onClick={() => sortBy("actor")}>Administrator{arrow("actor")}</button></TableHead>
                <TableHead><button type="button" onClick={() => sortBy("institution")}>Institution{arrow("institution")}</button></TableHead>
                <TableHead>Target</TableHead><TableHead>Outcome</TableHead><TableHead />
              </TableRow></TableHeader>
              <TableBody>
                {items?.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap">{fmtDateTime(e.at)}</TableCell>
                    <TableCell className="font-mono text-xs">{e.action}</TableCell>
                    <TableCell>{e.actor?.email ?? "—"}</TableCell>
                    <TableCell>{e.institution?.name ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{e.target ? `${e.target.entity}${e.target.id ? ` · ${e.target.id.slice(0, 8)}` : ""}` : "—"}</TableCell>
                    <TableCell><Badge variant={e.outcome === "success" ? "default" : "destructive"}>{e.outcome === "success" ? "Succeeded" : "Failed"}</Badge></TableCell>
                    <TableCell><Button variant="outline" size="sm" onClick={() => setOpen(e.id)}>Details</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      {data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{data.total} event{data.total === 1 ? "" : "s"} · page {data.page} of {data.totalPages}</span>
          <div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>Next</Button></div>
        </div>
      )}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{detail?.action ?? "Event"}</DialogTitle><DialogDescription>{detail ? `${fmtDateTime(detail.at)} · ${detail.outcome === "success" ? "Succeeded" : "Failed"}` : "Loading"}</DialogDescription></DialogHeader>
          {dLoading || !detail ? <Skeleton className="h-32" /> : (
            <div className="flex flex-col gap-2 text-sm">
              <div><span className="text-muted-foreground">Administrator: </span>{detail.actor?.email ?? "—"}{detail.actor?.name ? ` (${detail.actor.name})` : ""}</div>
              <div><span className="text-muted-foreground">Institution: </span>{detail.institution?.name ?? "—"}</div>
              <div><span className="text-muted-foreground">Target: </span>{detail.target ? `${detail.target.entity} ${detail.target.id ?? ""}` : "—"}</div>
              {detail.ip && <div><span className="text-muted-foreground">Address: </span>{detail.ip}</div>}
              {detail.reason && <div><span className="text-muted-foreground">Reason: </span>{detail.reason}</div>}
              {([["Detail", detail.detail], ["Before", detail.before], ["After", detail.after]] as const).map(([k, v]) => v != null && <div key={k}><div className="text-muted-foreground">{k}</div><pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs">{JSON.stringify(v, null, 2)}</pre></div>)}
              <p className="text-xs text-muted-foreground">Credentials are hidden. This record cannot be changed or deleted here.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
