"use client"

import * as React from "react"
import { CheckIcon } from "lucide-react"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { DocumentsStep, type Doc } from "@/components/onboarding/documents"
import { EducationStep, type Edu } from "@/components/onboarding/education"
import { ListEditor, Tags, Text } from "@/components/onboarding/fields"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, statusVariant, titleCase } from "@/lib/web/format"
import { ONBOARDING_LABEL } from "@/lib/web/onboarding"

type Personal = { fullName?: string; dob?: string; gender?: string; mobile?: string; alternateEmail?: string; address?: string; city?: string; state?: string; pincode?: string; linkedin?: string }
type Academics = { cgpa?: number | null; activeBacklogs?: number | null }
type Career = {
  summary?: string; technicalSkills: string[]; programmingLanguages: string[]; careerInterests: string[]; preferredRoles: string[]
  certifications: { name?: string; issuer?: string; year?: number | null }[]; projects: { title?: string; description?: string; tools?: string; link?: string }[]; internships: { company?: string; role?: string; duration?: string; description?: string }[]
}
export type WizardData = {
  status: string; editable: boolean; currentStep: number; institution: { name: string }
  assigned: Record<string, string | number | null>
  personal: Personal; academics: Academics; career: Career; education: Edu[]; documents: Doc[]; requiredDocuments: string[]
  declaration: { text: string; acceptedAt: string | null }; nameReview: { invited: string; entered: string } | null; reviewNote: string | null
  sections: { section: string; status: string; reviewComment: string | null }[]; corrections: { id: string; field: string; message: string; status: string }[]
  missing: { step: number; field: string; message: string }[]
}

const STEPS = ["Assigned details", "Personal information", "Education", "Documents", "Skills and career", "Review and submit"]
const GENDERS = ["Female", "Male", "Other", "Prefer not to say"].map((v) => ({ value: v, label: v }))
const ASSIGNED: [string, string][] = [["institution", "Institution"], ["campus", "Campus"], ["department", "Department"], ["programme", "Programme"], ["branch", "Branch"], ["admissionNumber", "Admission number"], ["admissionYear", "Admission year"], ["batch", "Batch"], ["academicYear", "Current academic year"], ["semester", "Current semester"], ["graduationYear", "Expected graduation year"]]
const FIXABLE = [["name", "Name"], ["department", "Department"], ["programme", "Programme"], ["branch", "Branch"], ["batch", "Batch"], ["admissionNumber", "Admission number"], ["admissionYear", "Admission year"], ["graduationYear", "Graduation year"], ["campus", "Campus"], ["email", "Email"], ["other", "Something else"]].map(([value, label]) => ({ value, label }))

export function Wizard({ initial, reload }: { initial: WizardData; reload: () => Promise<WizardData | undefined> }) {
  const [server, setServer] = React.useState(initial)
  const [step, setStep] = React.useState(Math.min(Math.max(initial.currentStep, 1), 6))
  const [personal, setPersonal] = React.useState<Personal>(initial.personal)
  const [academics, setAcademics] = React.useState<Academics>(initial.academics)
  const [career, setCareer] = React.useState<Career>(initial.career)
  const [busy, setBusy] = React.useState(false)
  const [fix, setFix] = React.useState(false)
  const editable = server.editable

  const refresh = React.useCallback(async () => { const d = await reload(); if (d) setServer(d) }, [reload])

  /** Saves every draft field. Called when moving between steps, so leaving mid-way never loses anything. */
  const save = React.useCallback(async (to?: number, extra: Record<string, unknown> = {}) => {
    if (!editable) return
    const d = await api<WizardData>("/api/student/onboarding", { method: "PUT", body: { currentStep: to ?? step, personal, academics, career, ...extra } })
    setServer(d)
  }, [editable, step, personal, academics, career])

  async function go(to: number) {
    if (to === step) return
    setBusy(true)
    try { await save(to); setStep(to) } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  async function draft() {
    setBusy(true)
    try { await save(); toast.success("Draft saved. You can continue later.") } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  async function declare(on: boolean) {
    try { await save(step, { acceptDeclaration: on }) } catch (e) { toastError(e) }
  }
  async function submit() {
    setBusy(true)
    try { await save(6); await api("/api/student/onboarding/submit", { method: "POST" }); toast.success("Submitted for verification"); await refresh() } catch (e) { toastError(e); await refresh() } finally { setBusy(false) }
  }

  const stepMissing = (n: number) => server.missing.filter((m) => m.step === n).length
  const flagged = server.sections.filter((s) => s.status === "CHANGES_REQUESTED")

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">Complete your profile</h1>
        <Badge variant={statusVariant(server.status)}>{ONBOARDING_LABEL[server.status] ?? titleCase(server.status)}</Badge>
      </div>

      {server.status === "CHANGES_REQUESTED" && (
        <Alert variant="destructive"><AlertTitle>Changes were requested</AlertTitle><AlertDescription>
          {server.reviewNote && <p>{server.reviewNote}</p>}
          {flagged.length > 0 && <ul className="mt-1 list-disc pl-5">{flagged.map((s) => <li key={s.section}>{titleCase(s.section)}{s.reviewComment && s.reviewComment !== server.reviewNote ? `: ${s.reviewComment}` : ""}</li>)}</ul>}
          <p className="mt-1">Update your details, then submit again from the last step.</p>
        </AlertDescription></Alert>
      )}
      {server.status === "SUBMITTED" || server.status === "VERIFICATION_IN_PROGRESS" ? <Alert><AlertTitle>{server.status === "SUBMITTED" ? "Submitted for verification" : "Being verified"}</AlertTitle><AlertDescription>Your profile is with the placement cell. You will be notified if they need anything. You cannot edit it while it is under review.</AlertDescription></Alert> : null}
      {server.status === "VERIFIED" && <Alert><AlertTitle>Your profile is verified</AlertTitle><AlertDescription>The placement cell has approved your details and documents.</AlertDescription></Alert>}
      {server.status === "REJECTED" && <Alert variant="destructive"><AlertTitle>Your profile was not accepted</AlertTitle><AlertDescription>{server.reviewNote ?? "Contact your placement cell."}</AlertDescription></Alert>}

      <nav aria-label="Steps" className="flex flex-wrap gap-1.5">
        {STEPS.map((label, i) => {
          const n = i + 1, done = n < step && stepMissing(n) === 0
          return (
            <Button key={label} size="sm" variant={n === step ? "default" : "outline"} disabled={busy} aria-current={n === step ? "step" : undefined} onClick={() => go(n)}>
              {done ? <CheckIcon /> : <span className="tabular-nums">{n}</span>}<span className="hidden sm:inline">{label}</span>
              {stepMissing(n) > 0 && n !== 6 && editable && <span className="size-1.5 rounded-full bg-destructive" aria-label="Needs attention" />}
            </Button>
          )
        })}
      </nav>

      <Card>
        <CardHeader><CardTitle>{step}. {STEPS[step - 1]}</CardTitle>{step === 1 && <CardDescription>These details were set by {server.institution.name}. You cannot change them here.</CardDescription>}</CardHeader>
        <CardContent className="flex flex-col gap-4">
          {step === 1 && (<>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
              {ASSIGNED.filter(([k]) => server.assigned[k] != null && server.assigned[k] !== "").map(([k, l]) => (<React.Fragment key={k}><dt className="text-muted-foreground">{l}</dt><dd>{String(server.assigned[k])}</dd></React.Fragment>))}
              <dt className="text-muted-foreground">Invited name</dt><dd>{String(server.assigned.invitedName)}</dd>
              <dt className="text-muted-foreground">Invited email</dt><dd className="break-all">{String(server.assigned.invitedEmail)}</dd>
            </dl>
            <div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-muted-foreground">Something wrong?</span><Button size="sm" variant="outline" onClick={() => setFix(true)}>Request a correction</Button></div>
            {server.corrections.length > 0 && <ul className="text-sm text-muted-foreground">{server.corrections.map((c) => <li key={c.id}>{titleCase(c.field)}: {c.message} <Badge variant={statusVariant(c.status)}>{titleCase(c.status)}</Badge></li>)}</ul>}
          </>)}

          {step === 2 && (<fieldset disabled={!editable} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Text id="fn" label="Full name" required value={personal.fullName} onChange={(v) => setPersonal({ ...personal, fullName: v })} disabled={!editable} hint={server.nameReview ? `You were invited as “${server.nameReview.invited}”. The placement cell will review the difference before it changes your record.` : "As on your official records."} /></div>
            <Text id="dob" label="Date of birth" type="date" required value={personal.dob} onChange={(v) => setPersonal({ ...personal, dob: v })} disabled={!editable} />
            <Field><FieldLabel>Gender</FieldLabel><OptionSelect className="w-full" value={personal.gender ?? ""} onChange={(v) => setPersonal({ ...personal, gender: v })} options={GENDERS} placeholder="Choose (optional)" /></Field>
            <Text id="mob" label="Personal mobile number" type="tel" required value={personal.mobile} onChange={(v) => setPersonal({ ...personal, mobile: v })} disabled={!editable} />
            <Text id="alt" label="Alternate email" type="email" value={personal.alternateEmail} onChange={(v) => setPersonal({ ...personal, alternateEmail: v })} disabled={!editable} hint="Optional. Your college email stays your sign-in." />
            <div className="sm:col-span-2"><Text id="adr" label="Address" area required value={personal.address} onChange={(v) => setPersonal({ ...personal, address: v })} disabled={!editable} /></div>
            <Text id="city" label="City" required value={personal.city} onChange={(v) => setPersonal({ ...personal, city: v })} disabled={!editable} />
            <Text id="state" label="State" required value={personal.state} onChange={(v) => setPersonal({ ...personal, state: v })} disabled={!editable} />
            <Text id="pin" label="Postal code" required value={personal.pincode} onChange={(v) => setPersonal({ ...personal, pincode: v })} disabled={!editable} />
            <Text id="li" label="LinkedIn address" type="url" value={personal.linkedin} onChange={(v) => setPersonal({ ...personal, linkedin: v })} disabled={!editable} hint="Optional." />
          </fieldset>)}

          {step === 3 && (<>
            <EducationStep items={server.education} editable={editable} onChanged={refresh} />
            <div className="rounded-lg border p-3">
              <div className="pb-2 text-sm font-medium">Your current programme so far</div>
              <p className="pb-2 text-sm text-muted-foreground">The programme assigned to you is kept separate from the qualifications above. Enter how you are doing in it.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Text id="cg" label="Current CGPA (out of 10)" type="number" required value={academics.cgpa} onChange={(v) => setAcademics({ ...academics, cgpa: v === "" ? null : Number(v) })} disabled={!editable} hint="Enter 0 if you have no result yet." />
                <Text id="bk" label="Active backlogs" type="number" required value={academics.activeBacklogs} onChange={(v) => setAcademics({ ...academics, activeBacklogs: v === "" ? null : Number(v) })} disabled={!editable} hint="Enter 0 if none." />
              </div>
            </div>
          </>)}

          {step === 4 && <DocumentsStep docs={server.documents} required={server.requiredDocuments} editable={editable} onChanged={refresh} />}

          {step === 5 && (<fieldset disabled={!editable} className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">Everything here is optional unless your institution asks for it. It feeds your resume and the drives you are matched to.</p>
            <Text id="sum" label="Professional summary" area value={career.summary} onChange={(v) => setCareer({ ...career, summary: v })} disabled={!editable} hint="Two or three lines about you." />
            <div className="grid gap-4 sm:grid-cols-2">
              <Tags id="ts" label="Technical skills" value={career.technicalSkills} onChange={(v) => setCareer({ ...career, technicalSkills: v })} disabled={!editable} />
              <Tags id="pl" label="Programming languages" value={career.programmingLanguages} onChange={(v) => setCareer({ ...career, programmingLanguages: v })} disabled={!editable} />
              <Tags id="ci" label="Career interests" value={career.careerInterests} onChange={(v) => setCareer({ ...career, careerInterests: v })} disabled={!editable} />
              <Tags id="pr" label="Preferred job roles" value={career.preferredRoles} onChange={(v) => setCareer({ ...career, preferredRoles: v })} disabled={!editable} />
            </div>
            <ListEditor id="cert" title="Certifications" noun="certification" fields={[{ name: "name", label: "Certification" }, { name: "issuer", label: "Issued by" }, { name: "year", label: "Year", type: "number" }]} items={career.certifications} onChange={(v) => setCareer({ ...career, certifications: v })} disabled={!editable} />
            <ListEditor id="proj" title="Projects" noun="project" fields={[{ name: "title", label: "Title" }, { name: "tools", label: "Tools used" }, { name: "link", label: "Link" }, { name: "description", label: "What you built", type: "textarea" }]} items={career.projects} onChange={(v) => setCareer({ ...career, projects: v })} disabled={!editable} />
            <ListEditor id="intern" title="Internship experience" noun="internship" fields={[{ name: "company", label: "Company" }, { name: "role", label: "Role" }, { name: "duration", label: "Duration" }, { name: "description", label: "What you did", type: "textarea" }]} items={career.internships} onChange={(v) => setCareer({ ...career, internships: v })} disabled={!editable} />
          </fieldset>)}

          {step === 6 && <ReviewStep data={server} personal={personal} career={career} academics={academics} go={go} onDeclare={declare} />}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" disabled={busy || step === 1} onClick={() => go(step - 1)}>Back</Button>
        <div className="flex flex-wrap gap-2">
          {editable && <Button variant="outline" disabled={busy} onClick={draft}>{busy && <Spinner />}Save draft</Button>}
          {step < 6 ? <Button disabled={busy} onClick={() => go(step + 1)}>Next</Button>
            : editable ? <Button disabled={busy || server.missing.length > 0 || !server.declaration.acceptedAt} onClick={submit}>{busy && <Spinner />}Submit for verification</Button> : null}
        </div>
      </div>
      <CorrectionDialog open={fix} onClose={() => setFix(false)} onSent={refresh} />
    </div>
  )
}

function Row({ k, v }: { k: string; v?: string | number | null }) {
  return <><dt className="text-muted-foreground">{k}</dt><dd className="break-words">{v === undefined || v === null || v === "" ? "—" : v}</dd></>
}
function Section({ title, to, editable, go, children }: { title: string; to: number; editable: boolean; go: (n: number) => void; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border p-3"><div className="flex items-center justify-between pb-2"><h3 className="text-sm font-medium">{title}</h3>{editable && <Button size="sm" variant="ghost" onClick={() => go(to)}>Edit</Button>}</div>{children}</section>
  )
}

function ReviewStep({ data, personal, career, academics, go, onDeclare }: { data: WizardData; personal: Personal; career: Career; academics: Academics; go: (n: number) => void; onDeclare: (on: boolean) => void }) {
  const miss = data.missing.filter((m) => m.field !== "declaration")
  return (
    <div className="flex flex-col gap-3 text-sm">
      {miss.length > 0 && data.editable ? (
        <Alert variant="destructive"><AlertTitle>{miss.length} thing{miss.length > 1 ? "s" : ""} still needed before you can submit</AlertTitle><AlertDescription><ul className="mt-1 flex flex-col gap-1">{miss.map((m) => <li key={m.field}>{m.message} <Button size="xs" variant="link" onClick={() => go(m.step)}>Go to step {m.step}</Button></li>)}</ul></AlertDescription></Alert>
      ) : data.editable ? <Alert><AlertTitle>Everything required is filled in</AlertTitle><AlertDescription>Check the summary, accept the declaration and submit.</AlertDescription></Alert> : null}
      <Section editable={data.editable} go={go} title="Personal information" to={2}><dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1"><Row k="Name" v={personal.fullName} /><Row k="Date of birth" v={personal.dob ? fmtDate(personal.dob) : null} /><Row k="Gender" v={personal.gender} /><Row k="Mobile" v={personal.mobile} /><Row k="Alternate email" v={personal.alternateEmail} /><Row k="Address" v={[personal.address, personal.city, personal.state, personal.pincode].filter(Boolean).join(", ")} /></dl></Section>
      <Section editable={data.editable} go={go} title="Education" to={3}>
        {data.education.length === 0 ? <p className="text-muted-foreground">None added.</p> : <ul className="flex flex-col gap-1">{data.education.map((e) => <li key={e.id}>{e.qualification}, {e.institution}{e.percentage != null ? ` · ${e.percentage}%` : e.cgpa != null ? ` · CGPA ${e.cgpa}` : ""}</li>)}</ul>}
        <p className="pt-2 text-muted-foreground">Current CGPA {academics.cgpa ?? "—"} · Active backlogs {academics.activeBacklogs ?? "—"}</p>
      </Section>
      <Section editable={data.editable} go={go} title="Documents" to={4}>{data.documents.length === 0 ? <p className="text-muted-foreground">None uploaded.</p> : <ul className="flex flex-col gap-1">{data.documents.map((d) => <li key={d.id}>{d.fileName} <Badge variant={statusVariant(d.status)}>{titleCase(d.status)}</Badge></li>)}</ul>}</Section>
      <Section editable={data.editable} go={go} title="Skills and career" to={5}><dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1"><Row k="Skills" v={[...career.technicalSkills, ...career.programmingLanguages].join(", ")} /><Row k="Interests" v={career.careerInterests.join(", ")} /><Row k="Preferred roles" v={career.preferredRoles.join(", ")} /><Row k="Certifications" v={career.certifications.length} /><Row k="Projects" v={career.projects.length} /><Row k="Internships" v={career.internships.length} /></dl></Section>
      <section className="rounded-lg border p-3">
        <h3 className="pb-2 text-sm font-medium">Declaration</h3>
        <p className="pb-3 text-muted-foreground">{data.declaration.text}</p>
        <label className="flex items-start gap-2"><Checkbox checked={!!data.declaration.acceptedAt} disabled={!data.editable} onCheckedChange={(on) => onDeclare(!!on)} className="mt-0.5" /><span>I have read and accept this declaration.</span></label>
      </section>
    </div>
  )
}

function CorrectionDialog({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent: () => void }) {
  const [field, setField] = React.useState("")
  const [message, setMessage] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  async function send() {
    setBusy(true)
    try { await api("/api/student/onboarding/correction", { method: "POST", body: { field, message } }); toast.success("Sent to the placement cell"); setField(""); setMessage(""); onClose(); onSent() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Request a correction</DialogTitle><DialogDescription>You cannot change assigned details yourself. Tell the placement cell what is wrong and they will fix it.</DialogDescription></DialogHeader>
        <Field><FieldLabel>What is wrong?</FieldLabel><OptionSelect className="w-full" value={field} onChange={setField} options={FIXABLE} placeholder="Choose a detail" /></Field>
        <Field><FieldLabel htmlFor="cm">Details</FieldLabel><Textarea id="cm" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} /></Field>
        <DialogFooter><Button disabled={busy || !field || message.trim().length < 5} onClick={send}>{busy && <Spinner />}Send</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
