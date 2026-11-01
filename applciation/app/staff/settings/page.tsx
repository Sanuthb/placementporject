"use client"

import * as React from "react"
import { toast } from "sonner"

import { ActiveBadge, MasterTab } from "@/components/master-tab"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, titleCase } from "@/lib/web/format"
import { useLookups } from "@/lib/web/lookups"
import { useApi } from "@/lib/web/use-api"

type Dept = { id: string; name: string; code: string; isActive: boolean }
type Batch = { id: string; name: string; startYear: number; endYear: number; isActive: boolean; program: { name: string } | null }
type Year = { id: string; name: string; startDate: string; endDate: string; isCurrent: boolean }
type Staff = { id: string; name: string; email: string; role: string; departmentId: string | null; isActive: boolean }

const ROLES = ["TPO_ADMIN", "PLACEMENT_OFFICER", "DEPARTMENT_COORDINATOR"].map((v) => ({ value: v, label: titleCase(v) }))
const SECTIONS = ["PERSONAL", "ACADEMICS", "EDUCATION_HISTORY", "SKILLS", "PROJECTS", "INTERNSHIPS", "RESUME", "DOCUMENTS"]
const APPROVALS = [["OFFER_CREATE", "Creating offers"], ["BULK_EMAIL", "Bulk emails"], ["BULK_STATUS_CHANGE", "Bulk status changes"], ["ELIGIBILITY_EXCEPTION", "Eligibility exceptions"]] as const

export default function SettingsPage() {
  const lk = useLookups()
  return (
    <Tabs defaultValue="departments">
      <TabsList className="flex-wrap">
        {["departments", "batches", "programs", "years", "staff", "college", "verification", "approvals"].map((t) => <TabsTrigger key={t} value={t}>{titleCase(t === "years" ? "academic years" : t)}</TabsTrigger>)}
      </TabsList>

      <TabsContent value="departments">
        <MasterTab<Dept> endpoint="/api/settings/departments" addLabel="Add department" patchPath={(r) => `/api/settings/departments/${r.id}`}
          fields={[{ name: "name", label: "Name" }, { name: "code", label: "Code" }]}
          columns={[{ label: "Name", cell: (r) => r.name }, { label: "Code", cell: (r) => r.code }, { label: "State", cell: (r) => <ActiveBadge active={r.isActive} /> }]} />
      </TabsContent>

      <TabsContent value="batches">
        <MasterTab<Batch> endpoint="/api/settings/batches" addLabel="Add batch" patchPath={(r) => `/api/settings/batches/${r.id}`}
          fields={[{ name: "name", label: "Name (for example 2026)" }, { name: "startYear", label: "Start year", type: "number" }, { name: "endYear", label: "End year", type: "number" }, ...(lk.programs.length ? [{ name: "programId", label: "Program", type: "select" as const, options: lk.programs, required: false }] : [])]}
          toBody={(v) => ({ name: v.name, startYear: Number(v.startYear), endYear: Number(v.endYear), programId: v.programId || null })}
          columns={[{ label: "Name", cell: (r) => r.name }, { label: "Years", cell: (r) => `${r.startYear} to ${r.endYear}` }, { label: "Program", cell: (r) => r.program?.name ?? "—" }, { label: "State", cell: (r) => <ActiveBadge active={r.isActive} /> }]} />
      </TabsContent>

      <TabsContent value="programs">
        <MasterTab<Dept> endpoint="/api/settings/programs" addLabel="Add program" patchPath={(r) => `/api/settings/programs/${r.id}`}
          fields={[{ name: "name", label: "Name" }, { name: "code", label: "Code" }]}
          columns={[{ label: "Name", cell: (r) => r.name }, { label: "Code", cell: (r) => r.code }, { label: "State", cell: (r) => <ActiveBadge active={r.isActive} /> }]} />
      </TabsContent>

      <TabsContent value="years">
        <MasterTab<Year & { id: string }> endpoint="/api/settings/academic-years" addLabel="Add academic year"
          fields={[{ name: "name", label: "Name (for example 2026-27)" }, { name: "startDate", label: "Starts", type: "date" }, { name: "endDate", label: "Ends", type: "date" }, { name: "isCurrent", label: "This is the current year", type: "checkbox" }]}
          toBody={(v) => ({ name: v.name, startDate: v.startDate, endDate: v.endDate, isCurrent: !!v.isCurrent })}
          columns={[{ label: "Name", cell: (r) => r.name }, { label: "From", cell: (r) => fmtDate(r.startDate) }, { label: "To", cell: (r) => fmtDate(r.endDate) }, { label: "Current", cell: (r) => (r.isCurrent ? "Yes" : "") }]} />
      </TabsContent>

      <TabsContent value="staff">
        <MasterTab<Staff> endpoint="/api/settings/staff" addLabel="Invite staff member" patchPath={(r) => `/api/settings/staff/${r.id}`}
          fields={[{ name: "name", label: "Full name" }, { name: "email", label: "Email", type: "email" }, { name: "role", label: "Role", type: "select", options: ROLES, required: true }, { name: "departmentId", label: "Department (coordinators only)", type: "select", options: lk.departments, required: false }]}
          toBody={(v) => ({ name: v.name, email: v.email, role: v.role, departmentId: v.role === "DEPARTMENT_COORDINATOR" ? v.departmentId || null : null })}
          columns={[{ label: "Name", cell: (r) => r.name }, { label: "Email", cell: (r) => r.email }, { label: "Role", cell: (r) => titleCase(r.role) }, { label: "Department", cell: (r) => (r.departmentId ? lk.departmentName[r.departmentId] ?? "—" : "—") }, { label: "State", cell: (r) => <ActiveBadge active={r.isActive} /> }]} />
      </TabsContent>

      <TabsContent value="college"><CollegeForm /></TabsContent>
      <TabsContent value="verification"><VerificationForm /></TabsContent>
      <TabsContent value="approvals"><PoliciesForm /></TabsContent>
    </Tabs>
  )
}

function CollegeForm() {
  const { data, reload } = useApi<{ name: string; logoUrl: string | null; brandColor: string | null }>("/api/settings/college")
  const [busy, setBusy] = React.useState(false)
  if (!data) return <Skeleton className="h-48" />
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setBusy(true)
    try { await api("/api/settings/college", { method: "PATCH", body: { name: f.get("name"), logoUrl: String(f.get("logoUrl")) || null, brandColor: String(f.get("brandColor")) || null } }); toast.success("College profile saved"); reload() } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  return (
    <Card className="max-w-xl">
      <CardHeader><CardTitle>College profile</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={save}>
          <FieldGroup>
            <Field><FieldLabel htmlFor="name">College name</FieldLabel><Input id="name" name="name" defaultValue={data.name} required /></Field>
            <Field><FieldLabel htmlFor="logoUrl">Logo address</FieldLabel><Input id="logoUrl" name="logoUrl" type="url" defaultValue={data.logoUrl ?? ""} /></Field>
            <Field><FieldLabel htmlFor="brandColor">Brand colour</FieldLabel><Input id="brandColor" name="brandColor" defaultValue={data.brandColor ?? ""} placeholder="#1a73e8" /><FieldDescription>Stored for reports and emails. The app keeps its own fixed look.</FieldDescription></Field>
            <Field><Button type="submit" disabled={busy}>{busy && <Spinner />}Save</Button></Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}

function VerificationForm() {
  const { data, reload } = useApi<{ requiredSections: string[]; requireAssessmentToOnboard: boolean }>("/api/settings/verification")
  const [sections, setSections] = React.useState<string[] | null>(null)
  const [assess, setAssess] = React.useState<boolean | null>(null)
  const [busy, setBusy] = React.useState(false)
  if (!data) return <Skeleton className="h-48" />
  const cur = sections ?? data.requiredSections
  async function save() {
    setBusy(true)
    try { await api("/api/settings/verification", { method: "PATCH", body: { requiredSections: cur, requireAssessmentToOnboard: assess ?? data!.requireAssessmentToOnboard } }); toast.success("Verification rules saved"); reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  return (
    <Card className="max-w-xl">
      <CardHeader><CardTitle>Verification rules</CardTitle><CardDescription>A student becomes verified when every required section is verified.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-3">
        {SECTIONS.map((s) => <label key={s} className="flex items-center gap-2 text-sm"><Checkbox checked={cur.includes(s)} onCheckedChange={(on) => setSections(on ? [...cur, s] : cur.filter((x) => x !== s))} />{titleCase(s)}</label>)}
        <label className="flex items-center gap-2 text-sm"><Switch checked={assess ?? data.requireAssessmentToOnboard} onCheckedChange={setAssess} />Require the personality and aptitude assessment before onboarding</label>
        <div><Button disabled={busy || cur.length === 0} onClick={save}>{busy && <Spinner />}Save</Button></div>
      </CardContent>
    </Card>
  )
}

function PoliciesForm() {
  const { data, reload } = useApi<{ maxOffersPerStudent: number | null; enforceTierUpgrade: boolean; shareRoundScores: boolean; approvalRequired: string[] }>("/api/settings/policies")
  const [need, setNeed] = React.useState<string[] | null>(null)
  const [tier, setTier] = React.useState<boolean | null>(null)
  const [share, setShare] = React.useState<boolean | null>(null)
  const [busy, setBusy] = React.useState(false)
  if (!data) return <Skeleton className="h-48" />
  const curNeed = need ?? data.approvalRequired
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const max = String(new FormData(e.currentTarget).get("max"))
    setBusy(true)
    try { await api("/api/settings/policies", { method: "PATCH", body: { maxOffersPerStudent: max ? Number(max) : null, enforceTierUpgrade: tier ?? data!.enforceTierUpgrade, shareRoundScores: share ?? data!.shareRoundScores, approvalRequired: curNeed } }); toast.success("Policies saved"); reload() } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  return (
    <Card className="max-w-xl">
      <CardHeader><CardTitle>Offer rules and approvals</CardTitle><CardDescription>Ticked actions wait for an admin to approve them before taking effect.</CardDescription></CardHeader>
      <CardContent>
        <form onSubmit={save}>
          <FieldGroup>
            <Field><FieldLabel htmlFor="max">Maximum offers per student</FieldLabel><Input id="max" name="max" type="number" min={1} max={20} defaultValue={data.maxOffersPerStudent ?? ""} /><FieldDescription>Leave empty for no limit.</FieldDescription></Field>
            <label className="flex items-center gap-2 text-sm"><Switch checked={tier ?? data.enforceTierUpgrade} onCheckedChange={setTier} />Placed students may only apply to higher-tier drives</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={share ?? data.shareRoundScores} onCheckedChange={setShare} />Show students their round scores and remarks</label>
            <div className="flex flex-col gap-2">{APPROVALS.map(([k, label]) => <label key={k} className="flex items-center gap-2 text-sm"><Checkbox checked={curNeed.includes(k)} onCheckedChange={(on) => setNeed(on ? [...curNeed, k] : curNeed.filter((x) => x !== k))} />Require approval for {label.toLowerCase()}</label>)}</div>
            <Field><Button type="submit" disabled={busy}>{busy && <Spinner />}Save</Button></Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
