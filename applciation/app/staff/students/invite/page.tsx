"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { api, toastError } from "@/lib/web/api"
import { useAuth } from "@/lib/web/auth"
import { useApi } from "@/lib/web/use-api"

type Dept = { id: string; name: string; isActive: boolean }
type Prog = { id: string; name: string; code: string; departmentId: string | null; isActive: boolean; branches: { id: string; name: string; isActive?: boolean }[] }
type BatchRow = { id: string; name: string; programId: string | null; branchId: string | null; admissionYear: number | null; startYear: number; endYear: number; isActive: boolean; status: string }
type Campus = { id: string; name: string; isActive: boolean }

/** The officer enters only who the student is and where they belong. Everything personal is collected from the student after they accept. */
export default function InviteStudentPage() {
  const router = useRouter()
  const { state } = useAuth()
  const [busy, setBusy] = React.useState(false)
  const [p, setP] = React.useState({ name: "", enrollmentNo: "", email: "" })
  const [m, setM] = React.useState({ campusId: "", departmentId: "", programId: "", branchId: "", batchId: "" })
  const [admissionYear, setAdmissionYear] = React.useState("")
  const [graduationYear, setGraduationYear] = React.useState("")

  const depts = useApi<Dept[]>("/api/settings/departments")
  const progs = useApi<Prog[]>("/api/settings/programs")
  const batches = useApi<BatchRow[]>("/api/settings/batches")
  const campuses = useApi<Campus[]>("/api/settings/campuses")
  const institution = state.status === "ready" ? state.profile.name : ""

  const deptOpts = (depts.data ?? []).filter((d) => d.isActive).map((d) => ({ value: d.id, label: d.name }))
  const programs = (progs.data ?? []).filter((x) => x.isActive && (!m.departmentId || !x.departmentId || x.departmentId === m.departmentId))
  const program = programs.find((x) => x.id === m.programId)
  const branches = (program?.branches ?? []).filter((b) => b.isActive !== false)
  const batchList = (batches.data ?? []).filter((b) => b.isActive && b.status !== "ARCHIVED" && (!m.programId || b.programId === m.programId) && (!m.branchId || !b.branchId || b.branchId === m.branchId))
  const batch = batchList.find((b) => b.id === m.batchId)
  const campusOpts = (campuses.data ?? []).filter((c) => c.isActive).map((c) => ({ value: c.id, label: c.name }))

  const choose = (patch: Partial<typeof m>) => setM((s) => ({ ...s, ...patch }))
  // The graduation year follows the batch; the admission year is filled from the batch too, and either can be corrected.
  function chooseBatch(id: string) {
    const b = batchList.find((x) => x.id === id)
    choose({ batchId: id })
    if (b) { setAdmissionYear(String(b.admissionYear ?? b.startYear)); setGraduationYear(String(b.endYear)) }
  }

  function problem(): string | null {
    if (p.name.trim().length < 2) return "Enter the student's full name"
    if (!p.enrollmentNo.trim()) return "Enter the admission number"
    if (!/^\S+@\S+\.\S+$/.test(p.email.trim())) return "Enter a valid college email address"
    if (!m.departmentId) return "Choose a department"
    if (!m.batchId) return "Choose a batch"
    const a = Number(admissionYear), g = Number(graduationYear)
    if (!Number.isInteger(a) || a < 1990 || a > 2100) return "Enter the admission year"
    if (!Number.isInteger(g) || g < a) return "Graduation year cannot be before the admission year"
    return null
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const err = problem()
    if (err) return toast.error(err)
    setBusy(true)
    try {
      const r = await api<{ studentId: string; emailSent: boolean; emailError: string | null }>("/api/students/invitations", {
        method: "POST",
        body: { name: p.name.trim(), enrollmentNo: p.enrollmentNo.trim(), email: p.email.trim(), campusId: m.campusId || null, departmentId: m.departmentId, programId: m.programId || null, branchId: m.branchId || null, batchId: m.batchId, admissionYear: Number(admissionYear), graduationYear: Number(graduationYear) },
      })
      if (r.emailSent) toast.success(`Invitation sent to ${p.email.trim()}`)
      else toast.warning("The student was added but the email could not be sent", { description: `${r.emailError ?? "Email failed"}. Use “Resend invitation” once email is working.` })
      router.push("/staff/students")
    } catch (x) { toastError(x) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Card>
        <CardHeader><CardTitle>Invite a student</CardTitle><CardDescription>The student receives a secure link, sets a password and fills in their own details, education and documents. You will review and verify them afterwards.</CardDescription></CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field><FieldLabel htmlFor="name">Student full name</FieldLabel><Input id="name" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} autoComplete="off" required /></Field>
              <Field><FieldLabel htmlFor="adm">Admission number</FieldLabel><Input id="adm" value={p.enrollmentNo} onChange={(e) => setP({ ...p, enrollmentNo: e.target.value })} autoComplete="off" required /></Field>
            </div>
            <Field><FieldLabel htmlFor="email">College email address</FieldLabel><Input id="email" type="email" value={p.email} onChange={(e) => setP({ ...p, email: e.target.value })} autoComplete="off" required /><FieldDescription>The invitation is sent here, and the student must confirm this address to accept it.</FieldDescription></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field><FieldLabel htmlFor="inst">Institution</FieldLabel><Input id="inst" value={institution} readOnly disabled /></Field>
              {campusOpts.length > 0 && <Field><FieldLabel>Campus</FieldLabel><OptionSelect className="w-full" value={m.campusId} onChange={(v) => choose({ campusId: v })} options={[{ value: "", label: "No specific campus" }, ...campusOpts]} placeholder="Choose a campus" /></Field>}
              <Field><FieldLabel>Department</FieldLabel><OptionSelect className="w-full" value={m.departmentId} onChange={(v) => choose({ departmentId: v, programId: "", branchId: "", batchId: "" })} options={deptOpts} placeholder="Choose a department" /></Field>
              <Field><FieldLabel>Programme</FieldLabel><OptionSelect className="w-full" value={m.programId} onChange={(v) => choose({ programId: v, branchId: "", batchId: "" })} options={[{ value: "", label: "From the batch" }, ...programs.map((x) => ({ value: x.id, label: `${x.name} (${x.code})` }))]} placeholder="Choose a programme" /></Field>
              {branches.length > 0 && <Field><FieldLabel>Branch / specialisation</FieldLabel><OptionSelect className="w-full" value={m.branchId} onChange={(v) => choose({ branchId: v, batchId: "" })} options={[{ value: "", label: "None" }, ...branches.map((b) => ({ value: b.id, label: b.name }))]} placeholder="Choose a branch" /></Field>}
              <Field><FieldLabel>Batch</FieldLabel><OptionSelect className="w-full" value={m.batchId} onChange={chooseBatch} options={batchList.map((b) => ({ value: b.id, label: b.name }))} placeholder="Choose a batch" /></Field>
              <Field><FieldLabel htmlFor="ay">Admission year</FieldLabel><Input id="ay" type="number" value={admissionYear} onChange={(e) => setAdmissionYear(e.target.value)} min={1990} max={2100} required /></Field>
              <Field><FieldLabel htmlFor="gy">Expected graduation year</FieldLabel><Input id="gy" type="number" value={graduationYear} onChange={(e) => setGraduationYear(e.target.value)} min={1990} max={2100} required /><FieldDescription>{batch ? `Taken from ${batch.name}.` : "Filled in when you choose a batch."}</FieldDescription></Field>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>
      <Alert><AlertTitle>What happens next</AlertTitle><AlertDescription>An email with a single-use link is sent now. If the student does not accept in time, you can resend it from the student list.</AlertDescription></Alert>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" type="button" render={<Link href="/staff/students" />}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy && <Spinner />}Send invitation</Button>
      </div>
    </form>
  )
}
