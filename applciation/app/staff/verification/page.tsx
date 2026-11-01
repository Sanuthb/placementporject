"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { SectionReview } from "@/components/section-review"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, titleCase } from "@/lib/web/format"
import { useLookups } from "@/lib/web/lookups"

type Item = { id: string; section: string; submittedAt: string; isRevision: boolean; student: { id: string; name: string; enrollmentNo: string; departmentId: string; batchId: string } }
type Page = { key: string; items: Item[]; next: string | null }

const SECTIONS = ["PERSONAL", "ACADEMICS", "EDUCATION_HISTORY", "SKILLS", "PROJECTS", "INTERNSHIPS", "RESUME", "DOCUMENTS"].map((s) => ({ value: s, label: titleCase(s) }))
const WAITING = [{ value: "", label: "Any waiting time" }, { value: "2", label: "2+ days" }, { value: "7", label: "7+ days" }, { value: "14", label: "14+ days" }]
const daysSince = (d: string) => Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000)

export default function VerificationQueuePage() {
  const lk = useLookups()
  const [section, setSection] = React.useState("")
  const [dept, setDept] = React.useState("")
  const [batch, setBatch] = React.useState("")
  const [waiting, setWaiting] = React.useState("")
  const [tick, setTick] = React.useState(0)
  const key = `${tick}|${section}|${dept}|${batch}|${waiting}`
  const [page, setPage] = React.useState<Page>({ key: "", items: [], next: null })
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [review, setReview] = React.useState<Item | null>(null)
  const [more, setMore] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const query = React.useMemo(() => ({ section, departmentId: dept, batchId: batch, waitingDays: waiting, limit: 50 }), [section, dept, batch, waiting])
  React.useEffect(() => {
    let alive = true
    api<{ items: Item[]; nextCursor: string | null }>("/api/verification/queue", { query })
      .then((r) => { if (alive) { setPage({ key, items: r.items, next: r.nextCursor }); setSelected(new Set()) } })
      .catch((e) => { if (alive) { setPage({ key, items: [], next: null }); toastError(e) } })
    return () => { alive = false }
  }, [key, query])
  const loading = page.key !== key
  const reload = () => setTick((t) => t + 1)

  async function loadMore() {
    setMore(true)
    try {
      const r = await api<{ items: Item[]; nextCursor: string | null }>("/api/verification/queue", { query: { ...query, cursor: page.next } })
      setPage((p) => ({ ...p, items: [...p.items, ...r.items], next: r.nextCursor }))
    } catch (e) { toastError(e) } finally { setMore(false) }
  }

  async function bulkApprove() {
    setBusy(true)
    try {
      const r = await api<{ approved: number; skipped: { reason: string }[] }>("/api/verification/bulk-approve", { method: "POST", body: { sectionIds: [...selected] } })
      if (r.skipped.length) toast.warning(`${r.approved} approved, ${r.skipped.length} skipped`, { description: r.skipped[0].reason })
      else toast.success(`${r.approved} sections approved`)
      reload()
    } catch (e) { toastError(e) } finally { setBusy(false) }
  }

  const allSelected = page.items.length > 0 && selected.size === page.items.length
  const toggle = (id: string, on: boolean) => setSelected((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <OptionSelect className="w-44" value={section} onChange={setSection} options={[{ value: "", label: "All sections" }, ...SECTIONS]} placeholder="Section" />
        <OptionSelect className="w-44" value={dept} onChange={setDept} options={[{ value: "", label: "All departments" }, ...lk.departments]} placeholder="Department" />
        <OptionSelect className="w-40" value={batch} onChange={setBatch} options={[{ value: "", label: "All batches" }, ...lk.batches]} placeholder="Batch" />
        <OptionSelect className="w-44" value={waiting} onChange={setWaiting} options={WAITING} placeholder="Waiting time" />
        {selected.size > 0 && <Button className="ml-auto" disabled={busy} onClick={bulkApprove}>{busy && <Spinner />}Approve {selected.size} selected</Button>}
      </div>

      {loading && page.items.length === 0 ? (
        <div className="flex flex-col gap-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : page.items.length === 0 ? (
        <Empty><EmptyHeader><EmptyTitle>Nothing waiting for review</EmptyTitle><EmptyDescription>Submitted sections appear here.</EmptyDescription></EmptyHeader></Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"><Checkbox checked={allSelected} onCheckedChange={(on) => setSelected(on ? new Set(page.items.map((i) => i.id)) : new Set())} aria-label="Select all" /></TableHead>
              <TableHead>Student</TableHead><TableHead>Section</TableHead><TableHead>Department</TableHead><TableHead>Submitted</TableHead><TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.items.map((i) => (
              <TableRow key={i.id} data-state={selected.has(i.id) ? "selected" : undefined}>
                <TableCell><Checkbox checked={selected.has(i.id)} onCheckedChange={(on) => toggle(i.id, !!on)} aria-label={`Select ${i.student.name}`} /></TableCell>
                <TableCell><Link href={`/staff/students/${i.student.id}`} className="font-medium underline-offset-4 hover:underline">{i.student.name}</Link><div className="text-xs text-muted-foreground">{i.student.enrollmentNo}</div></TableCell>
                <TableCell>{titleCase(i.section)} {i.isRevision && <Badge variant="secondary">Revision</Badge>}</TableCell>
                <TableCell>{lk.departmentName[i.student.departmentId] ?? "—"}</TableCell>
                <TableCell>{fmtDate(i.submittedAt)} <span className="text-muted-foreground">({daysSince(i.submittedAt)}d)</span></TableCell>
                <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setReview(i)}>Review</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {page.next && <div className="flex justify-center"><Button variant="outline" disabled={more} onClick={loadMore}>{more && <Spinner />}Load more</Button></div>}

      {review && <SectionReview studentId={review.student.id} studentName={review.student.name} section={review.section} open onOpenChange={(o) => !o && setReview(null)} onDone={reload} />}
    </div>
  )
}
