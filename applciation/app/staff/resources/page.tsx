"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { PlusIcon } from "lucide-react"

import { BLANK, ResourceForm, toBody, type ResourceValues } from "@/components/resource-form"
import { OptionSelect } from "@/components/option-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Row = { id: string; title: string; type: string; category: string; status: string; version: number; difficulty: string | null; language: string; expiresAt: string | null; expiry: string; hasFile: boolean; _count: { assignments: number; progress: number } }
type Overview = {
  counts: { draft: number; inReview: number; approved: number; rejected: number; archived: number; expiringOrExpired: number }
  mostUsed: { id: string; title: string; students: number; completed: number }[]; bestRated: { id: string; title: string; averageRating: number | null; ratings: number }[]
  needsAttention: { id: string; title: string; averageRating: number | null; ratings: number }[]; unused: { id: string; title: string; assignments: number }[]
}
export const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = { APPROVED: "default", IN_REVIEW: "secondary", DRAFT: "outline", REJECTED: "destructive", ARCHIVED: "outline" }
const STATUSES = [{ value: "", label: "Any status" }, ...["DRAFT", "IN_REVIEW", "APPROVED", "REJECTED", "ARCHIVED"].map((v) => ({ value: v, label: titleCase(v) }))]

/** The resource library: upload, review, approve, then assign. */
export default function ResourcesPage() {
  const [status, setStatus] = React.useState("")
  const [q, setQ] = React.useState("")
  const search = React.useDeferredValue(q)
  const { data, loading } = useApi<Row[]>("/api/resources", { status: status || undefined, q: search || undefined })
  const ov = useApi<Overview>("/api/resources/analytics")
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [v, setV] = React.useState<ResourceValues>(BLANK)
  const [file, setFile] = React.useState<File | null>(null)
  const [busy, setBusy] = React.useState(false)

  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    try {
      const r = await api<{ id: string }>("/api/resources", { method: "POST", body: toBody(v) })
      if (file) { const fd = new FormData(); fd.set("file", file); try { await api(`/api/resources/${r.id}/file`, { method: "POST", body: fd }) } catch (err) { toastError(err) } }
      router.push(`/staff/resources/${r.id}`)
    } catch (err) { toastError(err); setBusy(false) }
  }

  return (
    <Tabs defaultValue="library">
      <div className="flex flex-wrap items-center justify-between gap-2"><TabsList><TabsTrigger value="library">Library</TabsTrigger><TabsTrigger value="overview">How it is used</TabsTrigger></TabsList><Button onClick={() => { setV(BLANK); setFile(null); setOpen(true) }}><PlusIcon />Add resource</Button></div>
      <TabsContent value="library" className="flex flex-col gap-3">
        {ov.data && <div className="flex flex-wrap gap-2 text-sm"><Badge variant="secondary">{ov.data.counts.inReview} waiting for review</Badge><Badge variant="outline">{ov.data.counts.approved} approved</Badge><Badge variant="outline">{ov.data.counts.draft} drafts</Badge>{ov.data.counts.expiringOrExpired > 0 && <Badge variant="destructive">{ov.data.counts.expiringOrExpired} expired or expiring soon</Badge>}</div>}
        <div className="flex flex-wrap gap-2"><Input className="max-w-xs" aria-label="Search resources" placeholder="Search title, subject, topic or skill" value={q} onChange={(e) => setQ(e.target.value)} /><OptionSelect className="w-44" value={status} onChange={setStatus} options={STATUSES} placeholder="Any status" /></div>
        {!data ? <Skeleton className="h-48" /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Resource</TableHead><TableHead>Status</TableHead><TableHead>Type</TableHead><TableHead>Difficulty</TableHead><TableHead>Assigned</TableHead><TableHead>Used by</TableHead><TableHead>Expires</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.map((r) => (
                <TableRow key={r.id} className={loading ? "opacity-60" : ""}>
                  <TableCell><Link className="font-medium underline-offset-4 hover:underline" href={`/staff/resources/${r.id}`}>{r.title}</Link><div className="text-xs text-muted-foreground">{titleCase(r.category)} · {r.language} · v{r.version}</div></TableCell>
                  <TableCell><Badge variant={STATUS_VARIANT[r.status]}>{titleCase(r.status)}</Badge></TableCell>
                  <TableCell>{titleCase(r.type)}{r.hasFile ? " (file)" : ""}</TableCell>
                  <TableCell>{r.difficulty ? titleCase(r.difficulty) : "—"}</TableCell>
                  <TableCell>{r._count.assignments || "—"}</TableCell>
                  <TableCell>{r._count.progress || "—"}</TableCell>
                  <TableCell>{r.expiresAt ? <span className={r.expiry === "EXPIRED" ? "text-destructive" : ""}>{fmtDate(r.expiresAt)}{r.expiry === "EXPIRED" ? " (expired)" : r.expiry === "SOON" ? " (soon)" : ""}</span> : "—"}</TableCell>
                </TableRow>
              ))}
              {data.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No resources match.</TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
      </TabsContent>
      <TabsContent value="overview">
        {!ov.data ? <Skeleton className="h-48" /> : (
          <div className="grid gap-4 md:grid-cols-2">
            <List title="Most used" hint="By number of students who opened them" rows={ov.data.mostUsed.map((r) => ({ id: r.id, title: r.title, note: `${r.students} students, ${r.completed} finished` }))} />
            <List title="Best rated" hint="Resources with at least 3 ratings" rows={ov.data.bestRated.map((r) => ({ id: r.id, title: r.title, note: `${r.averageRating}/5 from ${r.ratings}` }))} />
            <List title="Rated poorly" hint="Average under 3: consider replacing" rows={ov.data.needsAttention.map((r) => ({ id: r.id, title: r.title, note: `${r.averageRating}/5 from ${r.ratings}` }))} />
            <List title="Approved but unused" hint="Nobody has opened them yet" rows={ov.data.unused.map((r) => ({ id: r.id, title: r.title, note: r.assignments ? `${r.assignments} assignments` : "not assigned" }))} />
          </div>
        )}
      </TabsContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Add resource</DialogTitle></DialogHeader>
          <form onSubmit={create} className="flex flex-col gap-4"><ResourceForm v={v} set={(p) => setV((o) => ({ ...o, ...p }))} showFile onFile={setFile} /><DialogFooter><Button type="submit" disabled={busy}>{busy && <Spinner />}Save as draft</Button></DialogFooter></form>
        </DialogContent>
      </Dialog>
    </Tabs>
  )
}

function List({ title, hint, rows }: { title: string; hint: string; rows: { id: string; title: string; note: string }[] }) {
  return (
    <Card size="sm"><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{hint}</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-1 text-sm">{rows.length === 0 ? <span className="text-muted-foreground">Nothing yet.</span> : rows.map((r) => <div key={r.id} className="flex justify-between gap-3"><Link className="underline-offset-4 hover:underline" href={`/staff/resources/${r.id}`}>{r.title}</Link><span className="text-muted-foreground">{r.note}</span></div>)}</CardContent></Card>
  )
}
