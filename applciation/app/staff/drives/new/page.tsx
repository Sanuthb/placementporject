"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { JOB_TYPES, ROUND_TYPES, toIso } from "@/lib/web/enums"
import { useLookups } from "@/lib/web/lookups"
import { useApi } from "@/lib/web/use-api"

type Round = { type: string; venue: string; scheduledAt: string }
const num = (v: FormDataEntryValue | null) => (String(v ?? "").trim() === "" ? undefined : Number(v))
const txt = (v: FormDataEntryValue | null) => (String(v ?? "").trim() || undefined)

export default function NewDrivePage() {
  const router = useRouter()
  const lk = useLookups()
  const companies = useApi<{ items: { id: string; name: string }[] }>("/api/companies", { limit: 100 })
  const [company, setCompany] = React.useState("")
  const [jobType, setJobType] = React.useState("FULL_TIME")
  const [depts, setDepts] = React.useState<string[]>([])
  const [batches, setBatches] = React.useState<string[]>([])
  const [programs, setPrograms] = React.useState<string[]>([])
  const [allowPlaced, setAllowPlaced] = React.useState(false)
  const [rounds, setRounds] = React.useState<Round[]>([])
  const [busy, setBusy] = React.useState(false)
  const flip = (list: string[], set: (v: string[]) => void, id: string, on: boolean) => set(on ? [...list, id] : list.filter((x) => x !== id))

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!company) { toast.error("Choose a company"); return }
    const f = new FormData(e.currentTarget)
    setBusy(true)
    try {
      const d = await api<{ id: string }>("/api/drives", {
        method: "POST",
        body: {
          companyId: company, role: f.get("role"), jobType, location: txt(f.get("location")), venue: txt(f.get("venue")), description: txt(f.get("description")),
          packageMinLpa: num(f.get("packageMinLpa")), packageMaxLpa: num(f.get("packageMaxLpa")),
          applicationDeadline: toIso(String(f.get("applicationDeadline"))), driveDate: toIso(String(f.get("driveDate"))),
          minCgpa: num(f.get("minCgpa")), minTenthPct: num(f.get("minTenthPct")), minTwelfthPct: num(f.get("minTwelfthPct")), maxActiveBacklogs: num(f.get("maxActiveBacklogs")),
          departmentIds: depts, batchIds: batches, programIds: programs, allowPlaced,
          rounds: rounds.map((r) => ({ type: r.type, venue: r.venue || undefined, scheduledAt: toIso(r.scheduledAt) })),
        },
      })
      toast.success("Drive saved as a draft")
      router.replace(`/staff/drives/${d.id}`)
    } catch (err) { toastError(err); setBusy(false) }
  }

  const picks = (title: string, items: { value: string; label: string }[], sel: string[], set: (v: string[]) => void) => items.length > 0 && (
    <Field>
      <FieldLabel>{title}</FieldLabel>
      <div className="flex flex-wrap gap-x-4 gap-y-2">{items.map((o) => <label key={o.value} className="flex items-center gap-2 text-sm"><Checkbox checked={sel.includes(o.value)} onCheckedChange={(on) => flip(sel, set, o.value, !!on)} />{o.label}</label>)}</div>
      <FieldDescription>Leave all unticked to allow everyone.</FieldDescription>
    </Field>
  )

  return (
    <form onSubmit={onSubmit} className="flex max-w-3xl flex-col gap-4">
      <Card>
        <CardHeader><CardTitle>Drive details</CardTitle><CardDescription>Saved as a draft. Publish it from the drive page when ready.</CardDescription></CardHeader>
        <CardContent>
          <FieldGroup>
            <Field><FieldLabel>Company</FieldLabel><OptionSelect className="w-full" value={company} onChange={setCompany} options={(companies.data?.items ?? []).map((c) => ({ value: c.id, label: c.name }))} placeholder="Choose a company" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field><FieldLabel htmlFor="role">Role</FieldLabel><Input id="role" name="role" minLength={2} required /></Field>
              <Field><FieldLabel>Job type</FieldLabel><OptionSelect className="w-full" value={jobType} onChange={setJobType} options={JOB_TYPES} placeholder="Job type" /></Field>
              <Field><FieldLabel htmlFor="location">Location</FieldLabel><Input id="location" name="location" /></Field>
              <Field><FieldLabel htmlFor="venue">Venue</FieldLabel><Input id="venue" name="venue" /></Field>
              <Field><FieldLabel htmlFor="packageMinLpa">Package from (LPA)</FieldLabel><Input id="packageMinLpa" name="packageMinLpa" type="number" step="0.1" min={0} /></Field>
              <Field><FieldLabel htmlFor="packageMaxLpa">Package up to (LPA)</FieldLabel><Input id="packageMaxLpa" name="packageMaxLpa" type="number" step="0.1" min={0} /></Field>
              <Field><FieldLabel htmlFor="applicationDeadline">Application deadline</FieldLabel><Input id="applicationDeadline" name="applicationDeadline" type="datetime-local" required /></Field>
              <Field><FieldLabel htmlFor="driveDate">Drive date</FieldLabel><Input id="driveDate" name="driveDate" type="datetime-local" required /></Field>
            </div>
            <Field><FieldLabel htmlFor="description">Job description</FieldLabel><Textarea id="description" name="description" /></Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Eligibility</CardTitle><CardDescription>You will see the eligible students before publishing.</CardDescription></CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-4">
              <Field><FieldLabel htmlFor="minCgpa">Minimum CGPA</FieldLabel><Input id="minCgpa" name="minCgpa" type="number" step="0.01" min={0} max={10} /></Field>
              <Field><FieldLabel htmlFor="minTenthPct">Minimum 10th %</FieldLabel><Input id="minTenthPct" name="minTenthPct" type="number" min={0} max={100} /></Field>
              <Field><FieldLabel htmlFor="minTwelfthPct">Minimum 12th %</FieldLabel><Input id="minTwelfthPct" name="minTwelfthPct" type="number" min={0} max={100} /></Field>
              <Field><FieldLabel htmlFor="maxActiveBacklogs">Max active backlogs</FieldLabel><Input id="maxActiveBacklogs" name="maxActiveBacklogs" type="number" min={0} /></Field>
            </div>
            {picks("Departments", lk.departments, depts, setDepts)}
            {picks("Batches", lk.batches, batches, setBatches)}
            {picks("Programs", lk.programs, programs, setPrograms)}
            <label className="flex items-center gap-2 text-sm"><Switch checked={allowPlaced} onCheckedChange={setAllowPlaced} />Students who are already placed may apply</label>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Rounds</CardTitle><CardDescription>In the order they happen.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3">
          {rounds.map((r, i) => (
            <div key={i} className="grid items-end gap-2 sm:grid-cols-[10rem_1fr_14rem_auto]">
              <Field><FieldLabel>Round {i + 1}</FieldLabel><OptionSelect className="w-full" value={r.type} onChange={(v) => setRounds((rs) => rs.map((x, j) => (j === i ? { ...x, type: v } : x)))} options={ROUND_TYPES} placeholder="Type" /></Field>
              <Field><FieldLabel>Venue</FieldLabel><Input value={r.venue} onChange={(e) => setRounds((rs) => rs.map((x, j) => (j === i ? { ...x, venue: e.target.value } : x)))} /></Field>
              <Field><FieldLabel>When</FieldLabel><Input type="datetime-local" value={r.scheduledAt} onChange={(e) => setRounds((rs) => rs.map((x, j) => (j === i ? { ...x, scheduledAt: e.target.value } : x)))} /></Field>
              <Button type="button" variant="ghost" size="icon" aria-label="Remove round" onClick={() => setRounds((rs) => rs.filter((_, j) => j !== i))}><Trash2Icon /></Button>
            </div>
          ))}
          <div><Button type="button" variant="outline" disabled={rounds.length >= 10} onClick={() => setRounds((rs) => [...rs, { type: "APTITUDE", venue: "", scheduledAt: "" }])}><PlusIcon />Add round</Button></div>
        </CardContent>
      </Card>

      <div><Button type="submit" disabled={busy}>{busy && <Spinner />}Save draft</Button></div>
    </form>
  )
}
