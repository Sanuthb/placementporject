"use client"

import * as React from "react"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { api, toastError } from "@/lib/web/api"
import { useApi } from "@/lib/web/use-api"

type Student = { id: string; name: string; enrollmentNo: string; email: string; departmentId: string; programId: string | null; branchId: string | null; batchId: string; campusId: string | null; admissionYear: number | null; inviteStatus: string }
type Prog = { id: string; name: string; code: string; departmentId: string | null; isActive: boolean; branches: { id: string; name: string }[] }
type Batch = { id: string; name: string; isActive: boolean; endYear: number }

/** Edits the details staff entered when inviting a student. Loads the student itself, so any screen can open it with just an id. */
export function EditStudentDialog({ studentId, onClose, onSaved }: { studentId: string | null; onClose: () => void; onSaved: () => void }) {
  return (
    <Dialog open={!!studentId} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit invitation details</DialogTitle><DialogDescription>These are the details entered when the student was invited. Personal details are filled in by the student. The department, programme, branch and batch must fit together.</DialogDescription></DialogHeader>
        {studentId && <Loader key={studentId} studentId={studentId} onClose={onClose} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  )
}

function Loader({ studentId, onClose, onSaved }: { studentId: string; onClose: () => void; onSaved: () => void }) {
  const st = useApi<Student>(`/api/students/${studentId}`)
  const inv = useApi<{ invitation: { status: string; graduationYear: number | null } | null }>(`/api/students/${studentId}/invitation`)
  const depts = useApi<{ id: string; name: string; isActive: boolean }[]>("/api/settings/departments")
  const progs = useApi<Prog[]>("/api/settings/programs")
  const batches = useApi<Batch[]>("/api/settings/batches")
  const campuses = useApi<{ id: string; name: string; isActive: boolean }[]>("/api/settings/campuses")
  if (!st.data || !inv.data || !depts.data || !progs.data || !batches.data || !campuses.data) return <Skeleton className="h-64" />
  return <Form student={st.data} invitation={inv.data.invitation} depts={depts.data} progs={progs.data} batches={batches.data} campuses={campuses.data} onClose={onClose} onSaved={onSaved} />
}

function Form({ student, invitation, depts, progs, batches, campuses, onClose, onSaved }: { student: Student; invitation: { status: string; graduationYear: number | null } | null; depts: { id: string; name: string; isActive: boolean }[]; progs: Prog[]; batches: Batch[]; campuses: { id: string; name: string; isActive: boolean }[]; onClose: () => void; onSaved: () => void }) {
  const accepted = invitation?.status === "ACCEPTED" || student.inviteStatus === "ACTIVATED"
  const endYear = batches.find((b) => b.id === student.batchId)?.endYear
  const [v, setV] = React.useState({ name: student.name, enrollmentNo: student.enrollmentNo, email: student.email, admissionYear: String(student.admissionYear ?? ""), graduationYear: String(invitation?.graduationYear ?? endYear ?? "") })
  const [campus, setCampus] = React.useState(student.campusId ?? "")
  const [dept, setDept] = React.useState(student.departmentId)
  const [program, setProgram] = React.useState(student.programId ?? "")
  const [branch, setBranch] = React.useState(student.branchId ?? "")
  const [batch, setBatch] = React.useState(student.batchId)
  const [busy, setBusy] = React.useState(false)
  const set = (k: keyof typeof v, x: string) => setV((s) => ({ ...s, [k]: x }))
  const branches = progs.find((p) => p.id === program)?.branches ?? []
  const campusOpts = campuses.filter((c) => c.isActive || c.id === campus).map((c) => ({ value: c.id, label: c.name }))
  const deptOpts = depts.filter((d) => d.isActive || d.id === dept).map((d) => ({ value: d.id, label: d.name }))
  const progOpts = progs.filter((p) => (p.isActive || p.id === program) && (!dept || !p.departmentId || p.departmentId === dept)).map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }))
  const batchOpts = batches.filter((b) => b.isActive || b.id === batch).map((b) => ({ value: b.id, label: b.name }))

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const a = Number(v.admissionYear), g = Number(v.graduationYear)
    if (v.admissionYear && v.graduationYear && g < a) return void toast.error("Graduation year cannot be before the admission year")
    setBusy(true)
    try {
      await api(`/api/students/${student.id}`, {
        method: "PATCH",
        body: {
          name: v.name.trim(), enrollmentNo: v.enrollmentNo.trim(), ...(accepted ? {} : { email: v.email.trim() }), campusId: campus || null,
          departmentId: dept, programId: program || null, branchId: branch || null, batchId: batch,
          ...(v.admissionYear ? { admissionYear: a } : {}), ...(v.graduationYear ? { graduationYear: g } : {}),
        },
      })
      toast.success("Student updated")
      onClose(); onSaved()
    } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={save}>
      <FieldGroup>
        <Field><FieldLabel htmlFor="ename">Student full name</FieldLabel><Input id="ename" value={v.name} onChange={(e) => set("name", e.target.value)} minLength={2} required /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="eadm">Admission number</FieldLabel><Input id="eadm" value={v.enrollmentNo} onChange={(e) => set("enrollmentNo", e.target.value)} required /></Field>
          <Field><FieldLabel htmlFor="eemail">College email</FieldLabel><Input id="eemail" type="email" value={v.email} onChange={(e) => set("email", e.target.value)} disabled={accepted} required />{accepted && <span className="text-xs text-muted-foreground">Locked: the student already has a login with this email.</span>}</Field>
        </div>
        {campusOpts.length > 0 && <Field><FieldLabel>Campus</FieldLabel><OptionSelect className="w-full" value={campus} onChange={setCampus} options={[{ value: "", label: "No specific campus" }, ...campusOpts]} placeholder="Choose a campus" /></Field>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field><FieldLabel>Department</FieldLabel><OptionSelect className="w-full" value={dept} onChange={setDept} options={deptOpts} placeholder="Choose a department" /></Field>
          <Field><FieldLabel>Programme</FieldLabel><OptionSelect className="w-full" value={program} onChange={(x) => { setProgram(x); setBranch("") }} options={[{ value: "", label: "From the batch" }, ...progOpts]} placeholder="Choose a programme" /></Field>
          {branches.length > 0 && <Field><FieldLabel>Branch / specialisation</FieldLabel><OptionSelect className="w-full" value={branch} onChange={setBranch} options={[{ value: "", label: "None" }, ...branches.map((b) => ({ value: b.id, label: b.name }))]} placeholder="Choose a branch" /></Field>}
          <Field><FieldLabel>Batch</FieldLabel><OptionSelect className="w-full" value={batch} onChange={setBatch} options={batchOpts} placeholder="Choose a batch" /></Field>
          <Field><FieldLabel htmlFor="eay">Admission year</FieldLabel><Input id="eay" type="number" value={v.admissionYear} onChange={(e) => set("admissionYear", e.target.value)} min={1990} max={2100} /></Field>
          <Field><FieldLabel htmlFor="egy">Expected graduation year</FieldLabel><Input id="egy" type="number" value={v.graduationYear} onChange={(e) => set("graduationYear", e.target.value)} min={1990} max={2100} /></Field>
        </div>
      </FieldGroup>
      <DialogFooter className="mt-4"><Button type="submit" disabled={busy}>{busy && <Spinner />}Save changes</Button></DialogFooter>
    </form>
  )
}
