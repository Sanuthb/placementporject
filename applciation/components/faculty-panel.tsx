"use client"

import * as React from "react"
import { HistoryIcon, PencilIcon, PlusIcon, PowerIcon, UsersIcon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, toastError } from "@/lib/web/api"
import { fmtDateTime } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Ref = { id: string; name: string; code?: string }
type Faculty = {
  id: string; name: string; email: string; isActive: boolean; menteeCount: number
  profile: { employeeId: string | null; designation: string | null; qualification: string | null; specialisation: string | null; phone: string | null } | null
  departments: Ref[]; programs: Ref[]; batches: Ref[]
}
type Dept = Ref & { isActive: boolean }
type Prog = Ref & { isActive: boolean; departmentId: string | null }
type Bat = Ref & { isActive: boolean; program: { departmentId: string | null } | null }

const toggle = (list: string[], id: string, on: boolean) => (on ? [...list, id] : list.filter((x) => x !== id))

/** Faculty and mentors: invite, profile, departments, and the programmes and batches they are allocated to. */
export function FacultyPanel() {
  const { data, loading, reload } = useApi<Faculty[]>("/api/settings/faculty")
  const depts = useApi<Dept[]>("/api/settings/departments").data?.filter((d) => d.isActive) ?? []
  const progs = useApi<Prog[]>("/api/settings/programs").data?.filter((p) => p.isActive) ?? []
  const bats = useApi<Bat[]>("/api/settings/batches").data?.filter((b) => b.isActive) ?? []
  const [form, setForm] = React.useState<{ mode: "add" | "edit"; id?: string } | null>(null)
  const [v, setV] = React.useState({ name: "", email: "", employeeId: "", designation: "", qualification: "", specialisation: "", phone: "" })
  const [d, setD] = React.useState<string[]>([])
  const [p, setP] = React.useState<string[]>([])
  const [b, setB] = React.useState<string[]>([])
  const [busy, setBusy] = React.useState(false)
  const [mentoring, setMentoring] = React.useState<Faculty | null>(null)

  function open(f?: Faculty) {
    setV({ name: f?.name ?? "", email: f?.email ?? "", employeeId: f?.profile?.employeeId ?? "", designation: f?.profile?.designation ?? "", qualification: f?.profile?.qualification ?? "", specialisation: f?.profile?.specialisation ?? "", phone: f?.profile?.phone ?? "" })
    setD(f?.departments.map((x) => x.id) ?? []); setP(f?.programs.map((x) => x.id) ?? []); setB(f?.batches.map((x) => x.id) ?? [])
    setForm(f ? { mode: "edit", id: f.id } : { mode: "add" })
  }
  // Only programmes and batches inside the chosen departments can be allocated (the server enforces the same rule).
  const progChoices = progs.filter((x) => x.departmentId && d.includes(x.departmentId))
  const batChoices = bats.filter((x) => x.program?.departmentId && d.includes(x.program.departmentId))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setBusy(true)
    try {
      const nul = (s: string) => s.trim() || null
      const profile = { employeeId: nul(v.employeeId), designation: nul(v.designation), qualification: nul(v.qualification), specialisation: nul(v.specialisation), phone: nul(v.phone) }
      const alloc = { departmentIds: d, programIds: p.filter((x) => progChoices.some((c) => c.id === x)), batchIds: b.filter((x) => batChoices.some((c) => c.id === x)) }
      if (form.mode === "add") await api("/api/settings/faculty", { method: "POST", body: { name: v.name, email: v.email, ...profile, ...alloc } })
      else await api(`/api/settings/faculty/${form.id}`, { method: "PATCH", body: { name: v.name, ...profile, ...alloc } })
      toast.success("Saved"); setForm(null); reload()
    } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  async function setActive(f: Faculty) {
    try { await api(`/api/settings/faculty/${f.id}`, { method: "PATCH", body: { isActive: !f.isActive } }); reload() } catch (err) { toastError(err) }
  }

  return (
    <div className="flex flex-col gap-4">
      <div><Button onClick={() => open()}><PlusIcon />Add faculty</Button></div>
      {loading ? <Skeleton className="h-40 w-full" /> : !data?.length ? <p className="text-sm text-muted-foreground">No faculty yet.</p> : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Departments</TableHead><TableHead>Programmes</TableHead><TableHead>Batches</TableHead><TableHead>Mentees</TableHead><TableHead>State</TableHead><TableHead className="w-24" /></TableRow></TableHeader>
            <TableBody>
              {data.map((f) => (
                <TableRow key={f.id}>
                  <TableCell><div className="font-medium">{f.name}</div><div className="text-xs text-muted-foreground">{f.profile?.designation ?? f.email}</div></TableCell>
                  <TableCell>{f.departments.map((x) => x.name).join(", ") || "—"}</TableCell>
                  <TableCell>{f.programs.map((x) => x.code ?? x.name).join(", ") || "—"}</TableCell>
                  <TableCell>{f.batches.map((x) => x.name).join(", ") || "—"}</TableCell>
                  <TableCell>{f.menteeCount}</TableCell>
                  <TableCell><Badge variant={f.isActive ? "default" : "secondary"}>{f.isActive ? "Active" : "Inactive"}</Badge></TableCell>
                  <TableCell className="flex gap-1">
                    <Button variant="ghost" size="icon-sm" aria-label={`Mentees of ${f.name}`} onClick={() => setMentoring(f)}><UsersIcon /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${f.name}`} onClick={() => open(f)}><PencilIcon /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label={f.isActive ? `Deactivate ${f.name}` : `Reactivate ${f.name}`} onClick={() => setActive(f)}><PowerIcon /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {mentoring && <MenteeDialog faculty={mentoring} onClose={() => { setMentoring(null); reload() }} />}
      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[90svh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form?.mode === "add" ? "Add faculty" : "Edit faculty"}</DialogTitle>
            <DialogDescription>{form?.mode === "add" ? "They get an email invitation and can sign in as faculty, with no placement access." : "Update the profile and where they teach."}</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="flex flex-col gap-4">
            <FieldGroup>
              <Field><FieldLabel htmlFor="f-name">Name</FieldLabel><Input id="f-name" required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
              {form?.mode === "add" && <Field><FieldLabel htmlFor="f-email">Email</FieldLabel><Input id="f-email" type="email" required value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>}
              <Field><FieldLabel htmlFor="f-emp">Employee ID</FieldLabel><Input id="f-emp" value={v.employeeId} onChange={(e) => setV({ ...v, employeeId: e.target.value })} /></Field>
              <Field><FieldLabel htmlFor="f-des">Designation</FieldLabel><Input id="f-des" value={v.designation} onChange={(e) => setV({ ...v, designation: e.target.value })} /></Field>
              <Field><FieldLabel htmlFor="f-qual">Qualification</FieldLabel><Input id="f-qual" value={v.qualification} onChange={(e) => setV({ ...v, qualification: e.target.value })} /></Field>
              <Field><FieldLabel htmlFor="f-spec">Specialisation</FieldLabel><Input id="f-spec" value={v.specialisation} onChange={(e) => setV({ ...v, specialisation: e.target.value })} /></Field>
              <Field><FieldLabel htmlFor="f-ph">Phone</FieldLabel><Input id="f-ph" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></Field>
            </FieldGroup>
            <Choice title="Departments" items={depts} value={d} onChange={setD} />
            <Choice title="Programmes" hint="Within the chosen departments. Gives access to those programmes' students." items={progChoices} value={p} onChange={setP} />
            <Choice title="Batches" hint="Within the chosen departments. Gives access to those batches' students." items={batChoices} value={b} onChange={setB} />
            <DialogFooter><Button type="submit" disabled={busy}>{busy && <Spinner />}Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Choice({ title, hint, items, value, onChange }: { title: string; hint?: string; items: Ref[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <Field>
      <FieldLabel>{title}</FieldLabel>
      {hint && <FieldDescription>{hint}</FieldDescription>}
      <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto rounded-md border p-2">
        {items.length ? items.map((i) => (
          <label key={i.id} className="flex items-center gap-2 text-sm"><Checkbox checked={value.includes(i.id)} onCheckedChange={(on) => onChange(toggle(value, i.id, !!on))} />{i.name}</label>
        )) : <span className="text-sm text-muted-foreground">Nothing to choose yet.</span>}
      </div>
    </Field>
  )
}

type Mentee = { id: string; name: string; enrollmentNo: string; department: { name: string }; batch: { name: string } }
type Found = { id: string; name: string; enrollmentNo: string }
type History = { mentor: { name: string } | null; history: { at: string; by: string | null; from: string | null; to: string | null }[] }

/** A faculty member's mentees: add by search, remove, and see a student's assignment history. The server enforces college and department rules. */
function MenteeDialog({ faculty, onClose }: { faculty: Faculty; onClose: () => void }) {
  const { data, loading, reload } = useApi<Mentee[]>("/api/settings/faculty/mentees", { facultyId: faculty.id })
  const [q, setQ] = React.useState("")
  const found = useApi<{ items: Found[] }>(q.trim().length >= 2 ? "/api/students" : null, { q: q.trim(), limit: 8 })
  const [hist, setHist] = React.useState<{ id: string; h: History } | null>(null)
  const [busy, setBusy] = React.useState(false)

  async function put(studentId: string, facultyId: string | null) {
    setBusy(true)
    try { await api("/api/settings/faculty/mentees", { method: "PUT", body: { facultyId, studentIds: [studentId] } }); toast.success(facultyId ? "Mentor assigned" : "Mentor removed"); reload(); setHist(null) } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  async function showHistory(id: string) {
    if (hist?.id === id) return setHist(null)
    try { setHist({ id, h: await api<History>("/api/settings/faculty/mentees", { query: { studentId: id } }) }) } catch (e) { toastError(e) }
  }
  const mine = new Set((data ?? []).map((m) => m.id))
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader><DialogTitle>Mentees of {faculty.name}</DialogTitle><DialogDescription>Students must be in one of this faculty member&apos;s departments{faculty.isActive ? "" : ". This account is deactivated, so new mentees cannot be added"}.</DialogDescription></DialogHeader>
        <Field><FieldLabel htmlFor="m-q">Find a student to assign</FieldLabel><Input id="m-q" placeholder="Name or admission number" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
        {q.trim().length >= 2 && (found.loading ? <Skeleton className="h-10" /> : !found.data?.items.length ? <p className="text-sm text-muted-foreground">No student matches.</p> : (
          <ul className="flex flex-col gap-1 text-sm">{found.data.items.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"><span>{s.name} <span className="text-muted-foreground">{s.enrollmentNo}</span></span>
              {mine.has(s.id) ? <Badge variant="secondary">Already a mentee</Badge> : <Button size="sm" disabled={busy || !faculty.isActive} onClick={() => put(s.id, faculty.id)}>Assign</Button>}</li>))}</ul>
        ))}
        <h3 className="pt-2 text-sm font-medium">Current mentees</h3>
        {loading ? <Skeleton className="h-16" /> : !data?.length ? <p className="text-sm text-muted-foreground">No mentees yet.</p> : (
          <ul className="flex flex-col gap-1 text-sm">{data.map((m) => (
            <li key={m.id} className="rounded-md border px-2 py-1.5">
              <div className="flex items-center justify-between gap-2"><span>{m.name} <span className="text-muted-foreground">{m.enrollmentNo} · {m.department.name} · {m.batch.name}</span></span>
                <span className="flex gap-1"><Button variant="ghost" size="icon-sm" aria-label={`History for ${m.name}`} onClick={() => showHistory(m.id)}><HistoryIcon /></Button><Button variant="outline" size="sm" disabled={busy} onClick={() => put(m.id, null)}>Unassign</Button></span></div>
              {hist?.id === m.id && (<ul className="mt-2 flex flex-col gap-0.5 text-xs text-muted-foreground">{hist.h.history.length ? hist.h.history.map((h, i) => <li key={i}>{fmtDateTime(h.at)}: {h.from ?? "no mentor"} → {h.to ?? "no mentor"}{h.by ? ` (by ${h.by})` : ""}</li>) : <li>No changes recorded.</li>}</ul>)}
            </li>))}</ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
