"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, download, toastError } from "@/lib/web/api"
import { useAuth } from "@/lib/web/auth"
import { statusVariant, titleCase } from "@/lib/web/format"
import { useLookups } from "@/lib/web/lookups"

type Student = { id: string; enrollmentNo: string; name: string; email: string; departmentId: string; batchId: string; inviteStatus: string; isActive: boolean }
type Page = { key: string; items: Student[]; next: string | null }

const INVITE = [{ value: "NOT_SENT", label: "Not sent" }, { value: "SENT", label: "Sent" }, { value: "ACTIVATED", label: "Activated" }]

export default function StudentsPage() {
  const { state } = useAuth()
  const canEdit = state.status === "ready" && state.profile.role !== "DEPARTMENT_COORDINATOR"
  const lk = useLookups()

  const [q, setQ] = React.useState("")
  const [dept, setDept] = React.useState("")
  const [batch, setBatch] = React.useState("")
  const [invite, setInvite] = React.useState("")
  const search = React.useDeferredValue(q)
  const [tick, setTick] = React.useState(0)
  const key = `${tick}|${search}|${dept}|${batch}|${invite}`
  const [page, setPage] = React.useState<Page>({ key: "", items: [], next: null })
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [more, setMore] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [adding, setAdding] = React.useState(false)

  const query = React.useMemo(() => ({ q: search, departmentId: dept, batchId: batch, inviteStatus: invite, limit: 50 }), [search, dept, batch, invite])
  React.useEffect(() => {
    let alive = true
    api<{ items: Student[]; nextCursor: string | null }>("/api/students", { query })
      .then((r) => { if (alive) { setPage({ key, items: r.items, next: r.nextCursor }); setSelected(new Set()) } })
      .catch((e) => { if (alive) { setPage({ key, items: [], next: null }); toastError(e) } })
    return () => { alive = false }
  }, [key, query])

  const loading = page.key !== key
  const reload = () => setTick((t) => t + 1)

  async function loadMore() {
    if (!page.next) return
    setMore(true)
    try {
      const r = await api<{ items: Student[]; nextCursor: string | null }>("/api/students", { query: { ...query, cursor: page.next } })
      setPage((p) => ({ ...p, items: [...p.items, ...r.items], next: r.nextCursor }))
    } catch (e) { toastError(e) } finally { setMore(false) }
  }

  async function syncInvites() {
    try { const r = await api<{ checked: number; activated: number }>("/api/students/invites/sync", { method: "POST" }); toast.success(`${r.activated} of ${r.checked} invited students have activated`); reload() } catch (e) { toastError(e) }
  }
  async function sendInvites(mode: "send" | "resend") {
    setBusy(true)
    try {
      const r = await api<{ sent: number; failed: { email: string; reason: string }[] }>("/api/students/invites", { method: "POST", body: { mode, studentIds: [...selected] } })
      if (r.failed.length) toast.warning(`${r.sent} invites sent, ${r.failed.length} failed`, { description: r.failed.slice(0, 3).map((f) => `${f.email}: ${f.reason}`).join("\n") })
      else toast.success(`${r.sent} invites sent`)
      reload()
    } catch (e) { toastError(e) } finally { setBusy(false) }
  }

  const allSelected = page.items.length > 0 && selected.size === page.items.length
  const toggle = (id: string, on: boolean) => setSelected((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-64" placeholder="Search name, enrollment no, email" value={q} onChange={(e) => setQ(e.target.value)} />
        <OptionSelect className="w-44" value={dept} onChange={setDept} options={[{ value: "", label: "All departments" }, ...lk.departments]} placeholder="Department" />
        <OptionSelect className="w-40" value={batch} onChange={setBatch} options={[{ value: "", label: "All batches" }, ...lk.batches]} placeholder="Batch" />
        <OptionSelect className="w-40" value={invite} onChange={setInvite} options={[{ value: "", label: "Any invite status" }, ...INVITE]} placeholder="Invite status" />
        {canEdit && (
          <div className="ml-auto flex flex-wrap gap-2">
            {selected.size > 0 && (
              <>
                <Button variant="outline" disabled={busy} onClick={() => sendInvites("send")}>{busy && <Spinner />}Send invites ({selected.size})</Button>
                <Button variant="outline" disabled={busy} onClick={() => sendInvites("resend")}>Resend invites</Button>
              </>
            )}
            <Button variant="outline" onClick={() => download("/api/students/export", { query: { departmentId: dept, batchId: batch } }).catch(toastError)}>Export</Button>
            <Button variant="outline" onClick={syncInvites}>Check activations</Button>
            <Button variant="outline" render={<Link href="/staff/students/import" />}>Import</Button>
            <Button onClick={() => setAdding(true)}>Add student</Button>
          </div>
        )}
      </div>

      {loading && page.items.length === 0 ? (
        <div className="flex flex-col gap-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : page.items.length === 0 ? (
        <Empty><EmptyHeader><EmptyTitle>No students found</EmptyTitle><EmptyDescription>Change the filters, or import a spreadsheet of admitted students.</EmptyDescription></EmptyHeader></Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {canEdit && <TableHead className="w-8"><Checkbox checked={allSelected} onCheckedChange={(on) => setSelected(on ? new Set(page.items.map((s) => s.id)) : new Set())} aria-label="Select all" /></TableHead>}
              <TableHead>Name</TableHead><TableHead>Enrollment no</TableHead><TableHead>Department</TableHead><TableHead>Batch</TableHead><TableHead>Invite</TableHead><TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.items.map((s) => (
              <TableRow key={s.id} data-state={selected.has(s.id) ? "selected" : undefined}>
                {canEdit && <TableCell><Checkbox checked={selected.has(s.id)} onCheckedChange={(on) => toggle(s.id, !!on)} aria-label={`Select ${s.name}`} /></TableCell>}
                <TableCell><Link href={`/staff/students/${s.id}`} className="font-medium underline-offset-4 hover:underline">{s.name}</Link><div className="text-xs text-muted-foreground">{s.email}</div></TableCell>
                <TableCell>{s.enrollmentNo}</TableCell>
                <TableCell>{lk.departmentName[s.departmentId] ?? "—"}</TableCell>
                <TableCell>{lk.batchName[s.batchId] ?? "—"}</TableCell>
                <TableCell><Badge variant={statusVariant(s.inviteStatus)}>{titleCase(s.inviteStatus)}</Badge></TableCell>
                <TableCell>{s.isActive ? <Badge variant="outline">Active</Badge> : <Badge variant="destructive">Deactivated</Badge>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {page.next && <div className="flex justify-center"><Button variant="outline" disabled={more} onClick={loadMore}>{more && <Spinner />}Load more</Button></div>}

      <AddStudentDialog open={adding} onOpenChange={setAdding} onCreated={reload} lk={lk} />
    </div>
  )
}

function AddStudentDialog({ open, onOpenChange, onCreated, lk }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void; lk: ReturnType<typeof useLookups> }) {
  const [dept, setDept] = React.useState("")
  const [batch, setBatch] = React.useState("")
  const [program, setProgram] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!dept || !batch) { toast.error("Choose a department and a batch"); return }
    const f = new FormData(e.currentTarget)
    const phone = String(f.get("phone") ?? "").trim()
    setBusy(true)
    try {
      await api("/api/students", { method: "POST", body: { enrollmentNo: f.get("enrollmentNo"), name: f.get("name"), email: f.get("email"), ...(phone ? { phone } : {}), departmentId: dept, batchId: batch, programId: program || null } })
      toast.success("Student added")
      onOpenChange(false)
      onCreated()
    } catch (err) { toastError(err) } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add a student</DialogTitle><DialogDescription>They can be invited to sign in afterwards.</DialogDescription></DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field><FieldLabel htmlFor="enrollmentNo">Enrollment number</FieldLabel><Input id="enrollmentNo" name="enrollmentNo" required /></Field>
            <Field><FieldLabel htmlFor="name">Full name</FieldLabel><Input id="name" name="name" minLength={2} required /></Field>
            <Field><FieldLabel htmlFor="email">Email</FieldLabel><Input id="email" name="email" type="email" required /></Field>
            <Field><FieldLabel htmlFor="phone">Phone (optional)</FieldLabel><Input id="phone" name="phone" type="tel" /></Field>
            <Field><FieldLabel>Department</FieldLabel><OptionSelect className="w-full" value={dept} onChange={setDept} options={lk.departments} placeholder="Choose a department" /></Field>
            <Field><FieldLabel>Batch</FieldLabel><OptionSelect className="w-full" value={batch} onChange={setBatch} options={lk.batches} placeholder="Choose a batch" /></Field>
            {lk.programs.length > 0 && <Field><FieldLabel>Program (optional)</FieldLabel><OptionSelect className="w-full" value={program} onChange={setProgram} options={lk.programs} placeholder="Choose a program" /></Field>}
          </FieldGroup>
          <DialogFooter className="mt-4"><Button type="submit" disabled={busy}>{busy && <Spinner />}Add student</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
