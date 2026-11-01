"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, toastError } from "@/lib/web/api"
import { fmtDateTime } from "@/lib/web/format"

type Log = { id: string; action: string; entity: string; entityId: string | null; reason: string | null; createdAt: string; actor: { name: string } | null }
type Page = { key: string; items: Log[]; next: string | null }

export default function AuditPage() {
  const [action, setAction] = React.useState("")
  const search = React.useDeferredValue(action)
  const [page, setPage] = React.useState<Page>({ key: "", items: [], next: null })
  const [more, setMore] = React.useState(false)
  React.useEffect(() => {
    let alive = true
    api<{ items: Log[]; nextCursor: string | null }>("/api/audit-logs", { query: { action: search, limit: 50 } })
      .then((r) => alive && setPage({ key: search, items: r.items, next: r.nextCursor })).catch((e) => { if (alive) { setPage({ key: search, items: [], next: null }); toastError(e) } })
    return () => { alive = false }
  }, [search])
  async function loadMore() {
    setMore(true)
    try { const r = await api<{ items: Log[]; nextCursor: string | null }>("/api/audit-logs", { query: { action: search, limit: 50, cursor: page.next } }); setPage((p) => ({ ...p, items: [...p.items, ...r.items], next: r.nextCursor })) } catch (e) { toastError(e) } finally { setMore(false) }
  }
  return (
    <div className="flex flex-col gap-4">
      <Input className="max-w-sm" placeholder="Filter by action, for example offer or student" value={action} onChange={(e) => setAction(e.target.value)} />
      {page.key !== search ? <Skeleton className="h-48" /> : (
        <Table>
          <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Who</TableHead><TableHead>Action</TableHead><TableHead>Record</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader>
          <TableBody>
            {page.items.map((l) => <TableRow key={l.id}><TableCell>{fmtDateTime(l.createdAt)}</TableCell><TableCell>{l.actor?.name ?? "System"}</TableCell><TableCell className="font-mono text-xs">{l.action}</TableCell><TableCell>{l.entity}</TableCell><TableCell className="text-muted-foreground">{l.reason ?? ""}</TableCell></TableRow>)}
            {page.items.length === 0 && <TableRow><TableCell colSpan={5} className="text-muted-foreground">Nothing found.</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}
      {page.next && <div className="flex justify-center"><Button variant="outline" disabled={more} onClick={loadMore}>{more && <Spinner />}Load more</Button></div>}
    </div>
  )
}
