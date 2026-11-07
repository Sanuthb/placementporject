"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CheckIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { DOC_CATEGORIES, EDUCATION_LEVELS } from "@/lib/academicConstants"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Dept = { id: string; name: string; isActive: boolean }
type Prog = { id: string; name: string; code: string; departmentId: string | null; isActive: boolean; branches: { id: string; name: string }[] }
type BatchRow = { id: string; name: string; programId: string | null; branchId: string | null; admissionYear: number | null; startYear: number; endYear: number; isActive: boolean; status: string }
type Sem = { id: string; number: number; name: string; academicYearId: string | null; academicYear: { name: string } | null }
type Year = { id: string; name: string }
type EduRow = {
  level: string; qualification: string; specialisation: string; institution: string; boardOrUniversity: string; rollNo: string
  admissionYear: string; completionYear: string; percentage: string; cgpa: string; maxMarks: string; obtainedMarks: string
  backlogs: string; status: string; isCurrent: boolean
}
type DocRow = { category: string; file: File }

const STEPS = ["Personal", "Academic mapping", "Education", "Documents", "Account", "Review"] as const
const GENDERS = ["Female", "Male", "Other", "Prefer not to say"].map((v) => ({ value: v, label: v }))
const EDU_STATUS = ["COMPLETED", "PURSUING", "DISCONTINUED"].map((v) => ({ value: v, label: titleCase(v) }))
const LEVEL_OPTIONS = EDUCATION_LEVELS.map((v) => ({ value: v, label: v }))
const DOC_OPTIONS = DOC_CATEGORIES.map(([value, label]) => ({ value, label }))
const MAX_FILE = 10 * 1024 * 1024

const blankEdu = (level = ""): EduRow => ({ level, qualification: "", specialisation: "", institution: "", boardOrUniversity: "", rollNo: "", admissionYear: "", completionYear: "", percentage: "", cgpa: "", maxMarks: "", obtainedMarks: "", backlogs: "0", status: "COMPLETED", isCurrent: false })
const num = (v: string) => (v.trim() === "" ? null : Number(v))

export default function AddStudentPage() {
  const router = useRouter()
  const [step, setStep] = React.useState(0)
  const [busy, setBusy] = React.useState(false)

  const [p, setP] = React.useState({ name: "", enrollmentNo: "", email: "", phone: "", dateOfBirth: "", gender: "", address: "" })
  const [m, setM] = React.useState({ departmentId: "", programId: "", branchId: "", batchId: "", semesterId: "", academicYearId: "" })
  const [edu, setEdu] = React.useState<EduRow[]>([])
  const [docs, setDocs] = React.useState<DocRow[]>([])
  const [docCat, setDocCat] = React.useState("")
  const [invite, setInvite] = React.useState(true)

  const depts = useApi<Dept[]>("/api/settings/departments")
  const progs = useApi<Prog[]>("/api/settings/programs")
  const batches = useApi<BatchRow[]>("/api/settings/batches")
  const years = useApi<Year[]>("/api/settings/academic-years")
  const sems = useApi<Sem[]>(m.batchId ? "/api/settings/semesters" : null, { batchId: m.batchId })

  // Each dropdown only offers what fits the one above it.
  const deptOpts = (depts.data ?? []).filter((d) => d.isActive).map((d) => ({ value: d.id, label: d.name }))
  const programs = (progs.data ?? []).filter((x) => x.isActive && (!m.departmentId || !x.departmentId || x.departmentId === m.departmentId))
  const program = programs.find((x) => x.id === m.programId)
  const batchList = (batches.data ?? []).filter((b) => b.isActive && b.status !== "ARCHIVED" && (!m.programId || b.programId === m.programId) && (!m.branchId || !b.branchId || b.branchId === m.branchId))
  const batch = batchList.find((b) => b.id === m.batchId)
  const semList = sems.data ?? []
  const sem = semList.find((x) => x.id === m.semesterId)
  const yearName = (id: string) => (years.data ?? []).find((y) => y.id === id)?.name

  const setPer = (k: keyof typeof p, v: string) => setP((s) => ({ ...s, [k]: v }))
  const chooseDept = (v: string) => setM({ departmentId: v, programId: "", branchId: "", batchId: "", semesterId: "", academicYearId: "" })
  const chooseProgram = (v: string) => setM((s) => ({ ...s, programId: v, branchId: "", batchId: "", semesterId: "", academicYearId: "" }))
  const chooseBranch = (v: string) => setM((s) => ({ ...s, branchId: v, batchId: "", semesterId: "", academicYearId: "" }))
  const chooseBatch = (v: string) => setM((s) => ({ ...s, batchId: v, semesterId: "", academicYearId: "" }))
  const chooseSemester = (v: string) => setM((s) => ({ ...s, semesterId: v, academicYearId: semList.find((x) => x.id === v)?.academicYearId ?? "" }))

  const setRow = (i: number, patch: Partial<EduRow>) => setEdu((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : patch.isCurrent ? { ...r, isCurrent: false } : r)))

  function problem(at: number): string | null {
    if (at === 0) {
      if (p.name.trim().length < 2) return "Enter the student's full name"
      if (!p.enrollmentNo.trim()) return "Enter the admission number"
      if (!/^\S+@\S+\.\S+$/.test(p.email.trim())) return "Enter a valid email address"
      if (p.phone.trim() && !/^\+?[\d\s-]{7,16}$/.test(p.phone.trim())) return "Enter a valid mobile number"
      if (p.dateOfBirth && new Date(p.dateOfBirth) > new Date()) return "Date of birth cannot be in the future"
    }
    if (at === 1) {
      if (!m.departmentId) return "Choose a department"
      if (!m.batchId) return "Choose a batch"
    }
    if (at === 2) {
      for (const [i, r] of edu.entries()) {
        if (!r.level || !r.qualification.trim() || !r.institution.trim()) return `Qualification ${i + 1}: level, qualification and institution are required`
        const o = num(r.obtainedMarks), x = num(r.maxMarks)
        if (o !== null && x !== null && o > x) return `Qualification ${i + 1}: obtained marks exceed the maximum`
        const a = num(r.admissionYear), c = num(r.completionYear)
        if (a !== null && c !== null && c < a) return `Qualification ${i + 1}: completion year is before the admission year`
        const pc = num(r.percentage), cg = num(r.cgpa)
        if (pc !== null && (pc < 0 || pc > 100)) return `Qualification ${i + 1}: percentage must be between 0 and 100`
        if (cg !== null && (cg < 0 || cg > 10)) return `Qualification ${i + 1}: CGPA must be between 0 and 10`
      }
    }
    return null
  }
  function next() {
    const e = problem(step)
    if (e) return toast.error(e)
    setStep((s) => s + 1)
  }
  function addDoc(file: File | undefined) {
    if (!file) return
    if (!docCat) return toast.error("Choose a document category first")
    if (!["application/pdf", "image/png", "image/jpeg"].includes(file.type)) return toast.error("Only PDF, PNG or JPEG files are accepted")
    if (file.size > MAX_FILE) return toast.error("That file is larger than 10 MB")
    setDocs((d) => [...d, { category: docCat, file }])
  }

  async function submit() {
    for (const i of [0, 1, 2]) { const e = problem(i); if (e) { setStep(i); return toast.error(e) } }
    setBusy(true)
    try {
      const body = {
        name: p.name.trim(), enrollmentNo: p.enrollmentNo.trim(), email: p.email.trim(),
        ...(p.phone.trim() ? { phone: p.phone.trim() } : {}),
        dateOfBirth: p.dateOfBirth || null, gender: p.gender || null, address: p.address.trim() || null,
        departmentId: m.departmentId, batchId: m.batchId, programId: m.programId || null, branchId: m.branchId || null,
        semesterId: m.semesterId || null, academicYearId: m.academicYearId || null,
        education: edu.map((r) => ({
          level: r.level, qualification: r.qualification.trim(), specialisation: r.specialisation.trim() || null, institution: r.institution.trim(),
          boardOrUniversity: r.boardOrUniversity.trim() || null, rollNo: r.rollNo.trim() || null, admissionYear: num(r.admissionYear), completionYear: num(r.completionYear),
          percentage: num(r.percentage), cgpa: num(r.cgpa), maxMarks: num(r.maxMarks), obtainedMarks: num(r.obtainedMarks),
          backlogs: Number(r.backlogs || 0), status: r.status, isCurrent: r.isCurrent,
        })),
      }
      const st = await api<{ id: string }>("/api/students", { method: "POST", body })
      // The student exists now. Anything below that fails is reported, and the rest of the record is kept.
      const failures: string[] = []
      for (const d of docs) {
        const fd = new FormData()
        fd.set("file", d.file); fd.set("category", d.category)
        try { await api(`/api/students/${st.id}/documents`, { method: "POST", body: fd }) } catch (e) { failures.push(`${d.file.name}: ${e instanceof Error ? e.message : "upload failed"}`) }
      }
      if (invite) { try { await api("/api/students/invites", { method: "POST", body: { studentIds: [st.id] } }) } catch (e) { failures.push(`Invitation: ${e instanceof Error ? e.message : "could not be sent"}`) } }
      if (failures.length) toast.warning(`Student added, but: ${failures.join("; ")}. You can finish this from the student's page.`, { duration: 10000 })
      else toast.success(invite ? "Student added and invitation sent" : "Student added")
      router.push(`/staff/students/${st.id}`)
    } catch (e) { toastError(e) } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Add a student</h1>
        <p className="text-sm text-muted-foreground">Step {step + 1} of {STEPS.length}: {STEPS[step]}</p>
      </header>

      <ol className="flex gap-1 overflow-x-auto pb-1" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} className="shrink-0">
            <button type="button" disabled={i > step || busy} onClick={() => setStep(i)} aria-current={i === step ? "step" : undefined}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${i === step ? "bg-primary/10 font-medium text-primary" : i < step ? "text-foreground hover:bg-muted" : "text-muted-foreground"}`}>
              <span className={`flex size-5 items-center justify-center rounded-full border text-[10px] ${i < step ? "border-primary bg-primary text-primary-foreground" : ""}`}>{i < step ? <CheckIcon className="size-3" /> : i + 1}</span>
              {label}
            </button>
          </li>
        ))}
      </ol>

      <Card>
        <CardHeader>
          <CardTitle>{STEPS[step]}</CardTitle>
          <CardDescription>{[
            "Who the student is. The admission number and email must be unique in your college.",
            "Pick from the existing structure. Each list only shows what fits the one above it.",
            "Every qualification is its own record. Add as many as the student has.",
            "Optional. Files are uploaded when you submit, and each one is verified separately.",
            "How the student gets their login.",
            "Check everything, then submit. You can go back to change any step.",
          ][step]}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {step === 0 && (
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field><FieldLabel htmlFor="name">Full name</FieldLabel><Input id="name" value={p.name} onChange={(e) => setPer("name", e.target.value)} /></Field>
                <Field><FieldLabel htmlFor="enr">Admission number</FieldLabel><Input id="enr" value={p.enrollmentNo} onChange={(e) => setPer("enrollmentNo", e.target.value)} /></Field>
                <Field><FieldLabel htmlFor="email">Email address</FieldLabel><Input id="email" type="email" value={p.email} onChange={(e) => setPer("email", e.target.value)} /></Field>
                <Field><FieldLabel htmlFor="phone">Mobile number</FieldLabel><Input id="phone" type="tel" value={p.phone} onChange={(e) => setPer("phone", e.target.value)} /></Field>
                <Field><FieldLabel htmlFor="dob">Date of birth</FieldLabel><Input id="dob" type="date" value={p.dateOfBirth} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setPer("dateOfBirth", e.target.value)} /></Field>
                <Field><FieldLabel>Gender</FieldLabel><OptionSelect className="w-full" value={p.gender} onChange={(v) => setPer("gender", v)} options={GENDERS} placeholder="Choose (optional)" /></Field>
              </div>
              <Field><FieldLabel htmlFor="addr">Address</FieldLabel><Textarea id="addr" value={p.address} onChange={(e) => setPer("address", e.target.value)} /></Field>
            </FieldGroup>
          )}

          {step === 1 && (
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field><FieldLabel>Department</FieldLabel><OptionSelect className="w-full" value={m.departmentId} onChange={chooseDept} options={deptOpts} placeholder="Choose a department" /></Field>
                <Field><FieldLabel>Programme</FieldLabel>
                  <OptionSelect className="w-full" value={m.programId} onChange={chooseProgram} options={programs.map((x) => ({ value: x.id, label: `${x.name} (${x.code})` }))} placeholder={m.departmentId ? (programs.length ? "Choose a programme" : "No programmes for this department") : "Choose a department first"} /></Field>
                <Field><FieldLabel>Branch / specialisation</FieldLabel>
                  <OptionSelect className="w-full" value={m.branchId} onChange={chooseBranch} options={(program?.branches ?? []).map((b) => ({ value: b.id, label: b.name }))} placeholder={program ? (program.branches.length ? "Choose (optional)" : "This programme has no branches") : "Choose a programme first"} /></Field>
                <Field><FieldLabel>Batch</FieldLabel>
                  <OptionSelect className="w-full" value={m.batchId} onChange={chooseBatch} options={batchList.map((b) => ({ value: b.id, label: b.name }))} placeholder={batchList.length ? "Choose a batch" : "No batches match"} /></Field>
                <Field><FieldLabel>Current semester</FieldLabel>
                  <OptionSelect className="w-full" value={m.semesterId} onChange={chooseSemester} options={semList.map((x) => ({ value: x.id, label: x.name }))} placeholder={m.batchId ? "Choose (optional)" : "Choose a batch first"} /></Field>
                <Field><FieldLabel>Current academic year</FieldLabel>
                  <OptionSelect className="w-full" value={m.academicYearId} onChange={(v) => setM((s) => ({ ...s, academicYearId: v }))} options={(years.data ?? []).map((y) => ({ value: y.id, label: y.name }))} placeholder="Set from the semester, or choose" /></Field>
              </div>
              {batch && (
                <dl className="grid grid-cols-2 gap-3 rounded-xl bg-muted/50 p-3 text-sm sm:grid-cols-3">
                  <div><dt className="text-muted-foreground">Admission year</dt><dd className="font-medium">{batch.admissionYear ?? batch.startYear}</dd></div>
                  <div><dt className="text-muted-foreground">Expected graduation</dt><dd className="font-medium">{batch.endYear}</dd></div>
                  <div><dt className="text-muted-foreground">Semesters</dt><dd className="font-medium">{semList.length || "—"}</dd></div>
                </dl>
              )}
              {(depts.data && !depts.data.length) || (batches.data && !batches.data.length) ? (
                <p className="text-sm text-muted-foreground">Nothing to choose from yet. <Link href="/staff/settings#programs" className="underline underline-offset-4">Set up departments, programmes and batches</Link> first.</p>
              ) : null}
            </FieldGroup>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              {edu.length === 0 && <p className="rounded-xl border border-dashed py-6 text-center text-sm text-muted-foreground">No qualifications yet. Add the school, higher secondary, degree and current programme.</p>}
              {edu.map((r, i) => (
                <div key={i} className="flex flex-col gap-3 rounded-xl border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">Qualification {i + 1}{r.isCurrent && <Badge className="ml-2">Current</Badge>}</span>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove qualification ${i + 1}`} onClick={() => setEdu((rows) => rows.filter((_, j) => j !== i))}><Trash2Icon /></Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field><FieldLabel>Level</FieldLabel><OptionSelect className="w-full" value={r.level} onChange={(v) => setRow(i, { level: v })} options={LEVEL_OPTIONS} placeholder="Choose a level" /></Field>
                    <Field><FieldLabel>Qualification</FieldLabel><Input value={r.qualification} placeholder="SSLC, PUC, BCA, MCA" onChange={(e) => setRow(i, { qualification: e.target.value })} /></Field>
                    <Field><FieldLabel>Specialisation / branch</FieldLabel><Input value={r.specialisation} onChange={(e) => setRow(i, { specialisation: e.target.value })} /></Field>
                    <Field><FieldLabel>Institution</FieldLabel><Input value={r.institution} onChange={(e) => setRow(i, { institution: e.target.value })} /></Field>
                    <Field><FieldLabel>University / board</FieldLabel><Input value={r.boardOrUniversity} onChange={(e) => setRow(i, { boardOrUniversity: e.target.value })} /></Field>
                    <Field><FieldLabel>Registration / roll number</FieldLabel><Input value={r.rollNo} onChange={(e) => setRow(i, { rollNo: e.target.value })} /></Field>
                    <Field><FieldLabel>Admission year</FieldLabel><Input type="number" value={r.admissionYear} onChange={(e) => setRow(i, { admissionYear: e.target.value })} /></Field>
                    <Field><FieldLabel>Completion year</FieldLabel><Input type="number" value={r.completionYear} onChange={(e) => setRow(i, { completionYear: e.target.value })} /></Field>
                    <Field><FieldLabel>Percentage</FieldLabel><Input type="number" step="0.01" value={r.percentage} onChange={(e) => setRow(i, { percentage: e.target.value })} /></Field>
                    <Field><FieldLabel>CGPA</FieldLabel><Input type="number" step="0.01" value={r.cgpa} onChange={(e) => setRow(i, { cgpa: e.target.value })} /></Field>
                    <Field><FieldLabel>Maximum marks</FieldLabel><Input type="number" value={r.maxMarks} onChange={(e) => setRow(i, { maxMarks: e.target.value })} /></Field>
                    <Field><FieldLabel>Obtained marks</FieldLabel><Input type="number" value={r.obtainedMarks} onChange={(e) => setRow(i, { obtainedMarks: e.target.value })} /></Field>
                    <Field><FieldLabel>Backlogs</FieldLabel><Input type="number" min={0} value={r.backlogs} onChange={(e) => setRow(i, { backlogs: e.target.value })} /></Field>
                    <Field><FieldLabel>Status</FieldLabel><OptionSelect className="w-full" value={r.status} onChange={(v) => setRow(i, { status: v })} options={EDU_STATUS} placeholder="Status" /></Field>
                  </div>
                  <label className="flex items-center gap-2 text-sm"><Checkbox checked={r.isCurrent} onCheckedChange={(on) => setRow(i, { isCurrent: !!on })} />This is the qualification the student is pursuing now</label>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                {["School", "Higher Secondary", "Undergraduate", "Postgraduate"].map((l) => (
                  <Button key={l} type="button" variant="outline" size="sm" onClick={() => setEdu((rows) => [...rows, blankEdu(l)])}><PlusIcon />{l}</Button>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setEdu((rows) => [...rows, blankEdu()])}><PlusIcon />Other</Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <Field className="sm:w-64"><FieldLabel>Category</FieldLabel><OptionSelect className="w-full" value={docCat} onChange={setDocCat} options={DOC_OPTIONS} placeholder="Choose a category" /></Field>
                <Field className="flex-1"><FieldLabel htmlFor="file">File (PDF, PNG or JPEG, up to 10 MB)</FieldLabel>
                  <Input id="file" type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => { addDoc(e.target.files?.[0]); e.target.value = "" }} /></Field>
              </div>
              {docs.length === 0 ? <p className="rounded-xl border border-dashed py-6 text-center text-sm text-muted-foreground">No documents added. You can also add them later from the student&apos;s page.</p> : (
                <ul className="flex flex-col gap-2">
                  {docs.map((d, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 rounded-xl border p-3 text-sm">
                      <div className="min-w-0"><div className="truncate font-medium">{d.file.name}</div><div className="text-xs text-muted-foreground">{DOC_OPTIONS.find((o) => o.value === d.category)?.label} · {(d.file.size / 1024).toFixed(0)} KB · Pending verification</div></div>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${d.file.name}`} onClick={() => setDocs((x) => x.filter((_, j) => j !== i))}><Trash2Icon /></Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-4">
              <dl className="grid gap-3 rounded-xl bg-muted/50 p-3 text-sm sm:grid-cols-3">
                <div><dt className="text-muted-foreground">Login email</dt><dd className="break-all font-medium">{p.email || "—"}</dd></div>
                <div><dt className="text-muted-foreground">Role</dt><dd className="font-medium">Student</dd></div>
                <div><dt className="text-muted-foreground">Account status</dt><dd className="font-medium">Active</dd></div>
              </dl>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox className="mt-0.5" checked={invite} onCheckedChange={(on) => setInvite(!!on)} />
                <span>Email an invitation now<span className="block text-muted-foreground">The student sets their own password from the link. Leave this off to invite later, one at a time or in bulk.</span></span>
              </label>
            </div>
          )}

          {step === 5 && (
            <div className="flex flex-col gap-4 text-sm">
              <Summary title="Personal" onEdit={() => setStep(0)} rows={[["Name", p.name], ["Admission number", p.enrollmentNo], ["Email", p.email], ["Mobile", p.phone], ["Date of birth", p.dateOfBirth ? fmtDate(p.dateOfBirth) : ""], ["Gender", p.gender], ["Address", p.address]]} />
              <Summary title="Academic mapping" onEdit={() => setStep(1)} rows={[
                ["Department", deptOpts.find((d) => d.value === m.departmentId)?.label ?? ""], ["Programme", program ? `${program.name} (${program.code})` : ""],
                ["Branch", program?.branches.find((b) => b.id === m.branchId)?.name ?? ""], ["Batch", batch?.name ?? ""],
                ["Admission year", batch ? String(batch.admissionYear ?? batch.startYear) : ""], ["Expected graduation", batch ? String(batch.endYear) : ""],
                ["Semester", sem?.name ?? ""], ["Academic year", yearName(m.academicYearId) ?? ""],
              ]} />
              <section className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between"><h3 className="font-medium">Education ({edu.length})</h3><Button type="button" variant="link" size="sm" onClick={() => setStep(2)}>Edit</Button></div>
                {edu.length === 0 ? <p className="text-muted-foreground">None added.</p> : edu.map((r, i) => (
                  <div key={i} className="rounded-lg border p-2">{r.qualification}{r.specialisation && `, ${r.specialisation}`} · {r.level} · {r.institution}{r.completionYear && ` · ${r.completionYear}`}{r.isCurrent && " · current"}</div>
                ))}
              </section>
              <section className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between"><h3 className="font-medium">Documents ({docs.length})</h3><Button type="button" variant="link" size="sm" onClick={() => setStep(3)}>Edit</Button></div>
                {docs.length === 0 ? <p className="text-muted-foreground">None added.</p> : docs.map((d, i) => <div key={i} className="rounded-lg border p-2">{d.file.name} · {DOC_OPTIONS.find((o) => o.value === d.category)?.label}</div>)}
              </section>
              <section><h3 className="font-medium">Account</h3><p className="text-muted-foreground">{invite ? "An invitation email will be sent after the student is created." : "No invitation will be sent yet."}</p></section>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" disabled={busy} render={step === 0 ? <Link href="/staff/students" /> : undefined} onClick={step === 0 ? undefined : () => setStep(step - 1)}>{step === 0 ? "Cancel" : "Back"}</Button>
        {step < STEPS.length - 1 ? <Button onClick={next}>Next</Button> : <Button disabled={busy} onClick={submit}>{busy && <Spinner />}Submit registration</Button>}
      </div>
    </div>
  )
}

function Summary({ title, rows, onEdit }: { title: string; rows: [string, string][]; onEdit: () => void }) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between"><h3 className="font-medium">{title}</h3><Button type="button" variant="link" size="sm" onClick={onEdit}>Edit</Button></div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
        {rows.filter(([, v]) => v).map(([k, v]) => <React.Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd className="min-w-0 break-words">{v}</dd></React.Fragment>)}
      </dl>
    </section>
  )
}
