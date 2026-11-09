"use client"

import * as React from "react"
import { toast } from "sonner"

import { DocThumb, DocumentViewer, type ViewDoc } from "@/components/document-viewer"
import { EditStudentDialog } from "@/components/edit-student-dialog"
import { StudentDialogs, type Dlg } from "@/components/onboarding-actions"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, fmtDateTime, statusVariant, titleCase } from "@/lib/web/format"
import { CAN_REQUEST_CHANGES, ONBOARDING_LABEL, REVIEWABLE } from "@/lib/web/onboarding"
import { useApi } from "@/lib/web/use-api"

type Doc = ViewDoc & { sizeBytes?: number }
type Review = {
  status: string
  student: { name: string; email: string; phone: string | null; enrollmentNo: string; campus: string | null; department: string; programme: string | null; branch: string | null; batch: string; admissionYear: number | null; graduationYear: number }
  profile: { personal: Record<string, string>; academics: { cgpa?: number | null; activeBacklogs?: number | null }; career: { summary?: string; technicalSkills?: string[]; programmingLanguages?: string[]; careerInterests?: string[]; preferredRoles?: string[]; certifications?: { name: string; issuer?: string }[]; projects?: { title: string; tools?: string }[]; internships?: { company: string; role?: string; duration?: string }[] }; submittedAt: string | null; declarationAcceptedAt: string | null; reviewNote: string | null } | null
  nameReview: { invited: string; entered: string; decidedAt: string | null } | null
  education: { id: string; qualification: string; institution: string; level: string; percentage: number | null; cgpa: number | null; backlogs: number; completionYear: number | null }[]
  documents: Doc[]
  missingDocuments: string[]
  sections: { section: string; status: string }[]
  corrections: { id: string; field: string; message: string; status: string; createdAt: string }[]
}

function Fact({ k, v }: { k: string; v?: string | number | null }) {
  return <div className="min-w-0"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="truncate text-sm" title={v == null ? undefined : String(v)}>{v === undefined || v === null || v === "" ? "—" : v}</dd></div>
}
function Chips({ items, empty = "—" }: { items?: string[]; empty?: string }) {
  const list = [...new Set((items ?? []).filter(Boolean))] // the same word can appear twice, for example a skill that is also a language
  return list.length ? <div className="flex flex-wrap gap-1">{list.map((x) => <Badge key={x} variant="secondary" className="font-normal">{x}</Badge>)}</div> : <span className="text-sm text-muted-foreground">{empty}</span>
}
function Card({ title, action, children, className = "" }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border bg-card p-3 ${className}`}><div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{title}</h3>{action}</div>{children}</section>
}
function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "good" | "bad" }) {
  return <div className="rounded-lg border bg-card px-3 py-2"><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-semibold tabular-nums leading-tight ${tone === "bad" ? "text-destructive" : ""}`}>{value}</div></div>
}

/** What a verifier checks, on one compact screen: the numbers first, then details, with documents viewable and verifiable in place. */
export function OnboardingReview({ studentId, name, canAct, onChanged }: { studentId: string; name: string; canAct: boolean; onChanged: () => void }) {
  const { data, reload } = useApi<Review>(`/api/students/${studentId}/onboarding`)
  const [dlg, setDlg] = React.useState<Dlg>(null)
  const [editing, setEditing] = React.useState(false)
  const [view, setView] = React.useState<number | null>(null)
  const started = React.useRef(false)

  // Opening a submitted profile marks it as being verified.
  React.useEffect(() => {
    if (data?.status === "SUBMITTED" && !started.current) {
      started.current = true
      api(`/api/students/${studentId}/onboarding/start-review`, { method: "POST" }).then(() => { reload(); onChanged() }).catch(() => undefined)
    }
  }, [data?.status, studentId, reload, onChanged])

  if (!data) return <div className="flex flex-col gap-3"><Skeleton className="h-16" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
  const p = data.profile?.personal ?? {}, c = data.profile?.career ?? {}, a = data.profile?.academics ?? {}
  const done = () => { reload(); onChanged() }
  const open = data.corrections.filter((x) => x.status === "PENDING")
  const docCount = (s: string) => data.documents.filter((d) => d.status === s).length
  const edu = (re: RegExp) => data.education.find((e) => re.test(`${e.level} ${e.qualification}`))
  const pct = (e?: { percentage: number | null; cgpa: number | null }) => (e?.percentage != null ? `${e.percentage}%` : e?.cgpa != null ? `CGPA ${e.cgpa}` : null)
  const verifiedSections = data.sections.filter((s) => s.status === "VERIFIED").length
  async function resolve(id: string, status: "APPROVED" | "REJECTED") {
    try { await api(`/api/students/${studentId}/corrections/${id}`, { method: "PATCH", body: { status } }); toast.success(status === "APPROVED" ? "Marked as fixed. The student was told." : "Declined. The student was told."); reload() } catch (e) { toastError(e) }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        <Badge variant={statusVariant(data.status)}>{ONBOARDING_LABEL[data.status] ?? titleCase(data.status)}</Badge>
        {data.profile?.submittedAt && <span className="text-xs text-muted-foreground">Submitted {fmtDateTime(data.profile.submittedAt)}</span>}
        <div className="flex flex-wrap gap-1.5 sm:ml-auto">
          {canAct && CAN_REQUEST_CHANGES.includes(data.status) && <Button size="sm" variant="outline" onClick={() => setDlg("corrections")}>Request corrections</Button>}
          {canAct && REVIEWABLE.includes(data.status) && <Button size="sm" variant="outline" onClick={() => setDlg("reject")}>Reject</Button>}
          {canAct && REVIEWABLE.includes(data.status) && <Button size="sm" onClick={() => setDlg("verify")}>Verify profile</Button>}
          <Button size="sm" variant="ghost" onClick={() => setDlg("history")}>History</Button>
        </div>
      </div>

      {data.nameReview && !data.nameReview.decidedAt && <Alert><AlertTitle>The student entered a different name</AlertTitle><AlertDescription>Invited as “{data.nameReview.invited}”, entered “{data.nameReview.entered}”. You choose which to keep when you verify.</AlertDescription></Alert>}
      {data.missingDocuments.length > 0 && REVIEWABLE.includes(data.status) && <Alert variant="destructive"><AlertTitle>Expected documents are missing</AlertTitle><AlertDescription>{data.missingDocuments.map(titleCase).join(", ")}</AlertDescription></Alert>}
      {data.profile?.reviewNote && ["CHANGES_REQUESTED", "REJECTED"].includes(data.status) && <Alert><AlertTitle>Your last comment to the student</AlertTitle><AlertDescription>{data.profile.reviewNote}</AlertDescription></Alert>}
      {open.length > 0 && (
        <Alert>
          <AlertTitle>Correction requested by the student</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 flex flex-col gap-1.5">{open.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-2"><Badge variant="outline">{titleCase(x.field)}</Badge><span className="min-w-0 flex-1">{x.message}</span>
                {canAct && <><Button size="xs" variant="outline" onClick={() => setEditing(true)}>Edit details</Button><Button size="xs" onClick={() => resolve(x.id, "APPROVED")}>Mark fixed</Button><Button size="xs" variant="ghost" onClick={() => resolve(x.id, "REJECTED")}>Decline</Button></>}</li>
            ))}</ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Current CGPA" value={a.cgpa ?? "—"} />
        <Stat label="10th / SSLC" value={pct(edu(/10|sslc|school/i)) ?? "—"} />
        <Stat label="12th / PUC" value={pct(edu(/12|puc|higher secondary/i)) ?? "—"} />
        <Stat label="Active backlogs" value={a.activeBacklogs ?? "—"} tone={(a.activeBacklogs ?? 0) > 0 ? "bad" : undefined} />
        <Stat label="Documents verified" value={`${docCount("VERIFIED")}/${data.documents.length}`} tone={docCount("REJECTED") ? "bad" : undefined} />
        <Stat label="Sections verified" value={`${verifiedSections}/${data.sections.length || 0}`} />
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        <div className="flex flex-col gap-3 lg:col-span-3">
          <Card title="Assigned by the institution" action={canAct && <Button size="xs" variant="ghost" onClick={() => setEditing(true)}>Edit</Button>}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              <Fact k="Admission no" v={data.student.enrollmentNo} /><Fact k="Batch" v={data.student.batch} /><Fact k="Department" v={data.student.department} />
              <Fact k="Programme" v={data.student.programme} /><Fact k="Branch" v={data.student.branch} /><Fact k="Campus" v={data.student.campus} />
              <Fact k="Admission year" v={data.student.admissionYear} /><Fact k="Graduation" v={data.student.graduationYear} /><Fact k="Email" v={data.student.email} />
            </dl>
          </Card>
          <Card title="Provided by the student">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              <Fact k="Name" v={p.fullName} /><Fact k="Date of birth" v={p.dob ? fmtDate(p.dob) : null} /><Fact k="Gender" v={p.gender} />
              <Fact k="Mobile" v={p.mobile} /><Fact k="Alternate email" v={p.alternateEmail} /><Fact k="LinkedIn" v={p.linkedin} />
              <div className="col-span-2 sm:col-span-3"><Fact k="Address" v={[p.address, p.city, p.state, p.pincode].filter(Boolean).join(", ")} /></div>
            </dl>
          </Card>
          <Card title={`Education (${data.education.length})`}>
            {data.education.length === 0 ? <p className="text-sm text-muted-foreground">None added.</p> : (
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th className="pb-1 pr-3 font-normal">Qualification</th><th className="pb-1 pr-3 font-normal">Institution</th><th className="pb-1 pr-3 font-normal">Year</th><th className="pb-1 pr-3 font-normal">Marks</th><th className="pb-1 font-normal">Backlogs</th></tr></thead>
                <tbody>{data.education.map((e) => <tr key={e.id} className="border-t"><td className="py-1 pr-3">{e.qualification} <span className="text-xs text-muted-foreground">{e.level}</span></td><td className="py-1 pr-3">{e.institution}</td><td className="py-1 pr-3 tabular-nums">{e.completionYear ?? "—"}</td><td className="py-1 pr-3 tabular-nums">{pct(e) ?? "—"}</td><td className="py-1 tabular-nums">{e.backlogs}</td></tr>)}</tbody></table></div>
            )}
          </Card>
          <Card title="Skills and career">
            <dl className="grid gap-2 sm:grid-cols-2">
              <div className="sm:col-span-2"><dt className="pb-0.5 text-xs text-muted-foreground">Summary</dt><dd className="text-sm">{c.summary || "—"}</dd></div>
              <div><dt className="pb-0.5 text-xs text-muted-foreground">Skills</dt><dd><Chips items={[...(c.technicalSkills ?? []), ...(c.programmingLanguages ?? [])]} /></dd></div>
              <div><dt className="pb-0.5 text-xs text-muted-foreground">Interests</dt><dd><Chips items={c.careerInterests} /></dd></div>
              <div><dt className="pb-0.5 text-xs text-muted-foreground">Preferred roles</dt><dd><Chips items={c.preferredRoles} /></dd></div>
              <div><dt className="pb-0.5 text-xs text-muted-foreground">Certifications</dt><dd><Chips items={c.certifications?.map((x) => x.name)} /></dd></div>
              <div><dt className="pb-0.5 text-xs text-muted-foreground">Projects</dt><dd><Chips items={c.projects?.map((x) => x.title)} /></dd></div>
              <div><dt className="pb-0.5 text-xs text-muted-foreground">Internships</dt><dd><Chips items={c.internships?.map((x) => `${x.company}${x.role ? ` · ${x.role}` : ""}`)} /></dd></div>
            </dl>
          </Card>
        </div>

        <Card title={`Documents (${data.documents.length})`} className="lg:col-span-2 lg:self-start">
          {data.documents.length === 0 ? <p className="text-sm text-muted-foreground">None uploaded.</p> : (
            <ul className="flex flex-col gap-2">
              {data.documents.map((d, i) => (
                <li key={d.id} className="flex items-center gap-2.5 rounded-lg border p-1.5">
                  <button type="button" onClick={() => setView(i)} className="shrink-0 rounded-md focus-visible:ring-3 focus-visible:ring-ring/50" aria-label={`View ${d.fileName}`}><DocThumb doc={d} className="size-14" /></button>
                  <div className="min-w-0 flex-1">
                    <button type="button" onClick={() => setView(i)} className="block max-w-full truncate text-left text-sm font-medium underline-offset-4 hover:underline">{d.fileName}</button>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"><span>{titleCase(d.category)}</span><Badge variant={statusVariant(d.status)}>{titleCase(d.status)}</Badge></div>
                    {d.status === "REJECTED" && d.rejectReason && <div className="truncate text-xs text-destructive" title={d.rejectReason}>{d.rejectReason}</div>}
                  </div>
                  <Button size="xs" variant="outline" onClick={() => setView(i)}>View</Button>
                </li>
              ))}
            </ul>
          )}
          <p className="pt-2 text-xs text-muted-foreground">Open a document to verify or reject it. Document status is tracked separately from the profile.</p>
        </Card>
      </div>

      <DocumentViewer docs={data.documents} index={view} onIndex={setView} onClose={() => setView(null)} studentId={canAct ? studentId : undefined} onChanged={done} />
      <EditStudentDialog studentId={editing ? studentId : null} onClose={() => setEditing(false)} onSaved={done} />
      <StudentDialogs studentId={studentId} name={name} dlg={dlg} close={() => setDlg(null)} onChanged={done} />
    </div>
  )
}
