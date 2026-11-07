"use client"

import * as React from "react"
import { toast } from "sonner"

import { ActiveBadge, MasterTab } from "@/components/master-tab"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { fmtDateTime, statusVariant, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Res = { id: string; title: string; category: string; url: string; isActive: boolean }
type Exp = { id: string; companyName: string; role: string; roundType: string | null; experience: string; difficulty: number; student: { name: string; enrollmentNo: string } }
type Slot = { id: string; startsAt: string; endsAt: string; status: string; counsellor: { name: string }; student: { name: string } | null }
const CATS = ["APTITUDE", "CODING", "INTERVIEW", "SOFT_SKILLS", "OTHER"].map((v) => ({ value: v, label: titleCase(v) }))

export default function PrepPage() {
  return (
    <Tabs defaultValue="resources">
      <TabsList><TabsTrigger value="resources">Resources</TabsTrigger><TabsTrigger value="experiences">Interview experiences</TabsTrigger><TabsTrigger value="counselling">Counselling slots</TabsTrigger></TabsList>
      <TabsContent value="resources">
        <MasterTab<Res> endpoint="/api/prep/resources" addLabel="Add resource" noun="resource" editable editFields={[{ name: "title", label: "Title" }, { name: "url", label: "Link" }, { name: "description", label: "Description", required: false }]} toEditBody={(v) => ({ title: v.title, url: v.url, description: v.description || null })} deletePath={(r) => `/api/prep/resources/${r.id}`} patchPath={(r) => `/api/prep/resources/${r.id}`}
          fields={[{ name: "title", label: "Title" }, { name: "category", label: "Category", type: "select", options: CATS, required: true }, { name: "url", label: "Link" }, { name: "description", label: "Description", required: false }]}
          columns={[{ label: "Title", cell: (r) => <a className="underline underline-offset-4" href={r.url} target="_blank" rel="noreferrer">{r.title}</a> }, { label: "Category", cell: (r) => titleCase(r.category) }, { label: "State", cell: (r) => <ActiveBadge active={r.isActive} /> }]} />
      </TabsContent>
      <TabsContent value="experiences"><Experiences /></TabsContent>
      <TabsContent value="counselling">
        <MasterTab<Slot> endpoint="/api/prep/counselling" addLabel="Open a slot"
          fields={[{ name: "startsAt", label: "Starts", type: "date" }, { name: "time", label: "Start time (24h, for example 14:30)" }, { name: "minutes", label: "Length (minutes)", type: "number" }]}
          toBody={(v) => { const start = new Date(`${v.startsAt}T${v.time}`); return { slots: [{ startsAt: start.toISOString(), endsAt: new Date(start.getTime() + Number(v.minutes) * 60000).toISOString() }] } }}
          columns={[
            { label: "When", cell: (r) => fmtDateTime(r.startsAt) }, { label: "Counsellor", cell: (r) => r.counsellor.name }, { label: "Booked by", cell: (r) => r.student?.name ?? "—" },
            { label: "Status", cell: (r) => <Badge variant={statusVariant(r.status === "BOOKED" ? "PENDING" : r.status === "COMPLETED" ? "VERIFIED" : "")}>{titleCase(r.status)}</Badge> },
            { label: "Action", cell: (r, reload) => (r.status === "BOOKED" || r.status === "OPEN") ? <span className="space-x-2">{r.status === "BOOKED" && <Button size="sm" onClick={() => api(`/api/prep/counselling/${r.id}/complete`, { method: "POST", body: {} }).then(reload, toastError)}>Complete</Button>}<Button size="sm" variant="outline" onClick={() => api(`/api/prep/counselling/${r.id}/cancel`, { method: "POST" }).then(reload, toastError)}>Cancel</Button></span> : null },
          ]} />
      </TabsContent>
    </Tabs>
  )
}

function Experiences() {
  const { data, reload } = useApi<Exp[]>("/api/prep/experiences", { status: "PENDING" })
  const [target, setTarget] = React.useState<Exp | null>(null)
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  async function moderate(decision: "APPROVE" | "REJECT") {
    setBusy(true)
    try { await api(`/api/prep/experiences/${target!.id}/moderate`, { method: "POST", body: { decision, ...(note.trim() ? { note: note.trim() } : {}) } }); toast.success(decision === "APPROVE" ? "Published to students" : "Rejected"); setTarget(null); setNote(""); reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  if (!data) return <Skeleton className="h-32" />
  return (
    <>
      <Table>
        <TableHeader><TableRow><TableHead>Company / role</TableHead><TableHead>Shared by</TableHead><TableHead>Difficulty</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
        <TableBody>
          {data.map((x) => <TableRow key={x.id}><TableCell>{x.companyName}<div className="text-xs text-muted-foreground">{x.role}{x.roundType ? ` · ${titleCase(x.roundType)}` : ""}</div></TableCell><TableCell>{x.student.name}</TableCell><TableCell>{x.difficulty}/5</TableCell><TableCell className="text-right"><Button size="sm" onClick={() => setTarget(x)}>Review</Button></TableCell></TableRow>)}
          {data.length === 0 && <TableRow><TableCell colSpan={4} className="text-muted-foreground">Nothing waiting for review.</TableCell></TableRow>}
        </TableBody>
      </Table>
      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{target?.companyName}: {target?.role}</DialogTitle><DialogDescription className="whitespace-pre-wrap">{target?.experience}</DialogDescription></DialogHeader>
          <Field><FieldLabel htmlFor="n">Note (required to reject)</FieldLabel><Textarea id="n" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <DialogFooter><Button variant="outline" disabled={busy || !note.trim()} onClick={() => moderate("REJECT")}>Reject</Button><Button disabled={busy} onClick={() => moderate("APPROVE")}>{busy && <Spinner />}Approve</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
