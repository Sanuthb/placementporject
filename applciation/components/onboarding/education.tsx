"use client"

import * as React from "react"
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { Text } from "@/components/onboarding/fields"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { EDUCATION_LEVELS } from "@/lib/academicConstants"
import { api, toastError } from "@/lib/web/api"
import { statusVariant, titleCase } from "@/lib/web/format"

export type Edu = {
  id: string; level: string; qualification: string; specialisation: string | null; institution: string; boardOrUniversity: string | null; admissionYear: number | null; completionYear: number | null
  percentage: number | null; cgpa: number | null; backlogs: number; status: string
  /** Present on records that go through staff review (the profile page); the onboarding wizard does not use them. */
  reviewStatus?: string; reviewComment?: string | null; pendingData?: Record<string, unknown> | null
}
const blank = { level: "", qualification: "", specialisation: "", institution: "", boardOrUniversity: "", admissionYear: "", completionYear: "", percentage: "", cgpa: "", backlogs: "0", status: "COMPLETED" }
const num = (v: string) => (v.trim() === "" ? null : Number(v))
const LEVELS = EDUCATION_LEVELS.map((v) => ({ value: v, label: v }))
const STATUS = ["COMPLETED", "PURSUING", "DISCONTINUED"].map((v) => ({ value: v, label: titleCase(v) }))
const SUGGEST: Record<string, string> = { School: "SSLC / 10th", "Higher Secondary": "PUC / 12th", Diploma: "Diploma", Undergraduate: "Bachelor's degree" }

/** Previous qualifications. The programme the institution assigned is shown on step 1 and is not listed here. */
export function EducationStep({ items, editable, onChanged, showStatus = false }: { items: Edu[]; editable: boolean; onChanged: () => void; showStatus?: boolean }) {
  const [editing, setEditing] = React.useState<Edu | "new" | null>(null)
  async function remove(e: Edu) {
    try { await api(`/api/student/education/${e.id}`, { method: "DELETE" }); toast.success("Removed"); onChanged() } catch (x) { toastError(x) }
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">Add every school, college or diploma you completed before this programme, for example SSLC, PUC / 12th and your undergraduate degree. Add each one separately.</p>
      {items.length === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nothing added yet.</p>}
      {(showStatus ? items.map((e) => (e.pendingData ? ({ ...e, ...e.pendingData } as Edu) : e)) : items).map((e) => (
        <div key={e.id} className="flex flex-wrap items-start gap-3 rounded-lg border p-3 text-sm">
          <div className="min-w-0 flex-1">
            <div className="font-medium">{e.qualification}{e.specialisation ? `, ${e.specialisation}` : ""} <Badge variant="outline" className="ml-1">{e.level}</Badge>{showStatus && e.reviewStatus && e.reviewStatus !== "DRAFT" && <Badge variant={e.pendingData ? "secondary" : statusVariant(e.reviewStatus)} className="ml-1">{e.pendingData ? "Revision pending" : titleCase(e.reviewStatus)}</Badge>}</div>
            <div className="text-muted-foreground">{e.institution}{e.boardOrUniversity ? ` · ${e.boardOrUniversity}` : ""}</div>
            <div className="text-muted-foreground">{[e.admissionYear && e.completionYear ? `${e.admissionYear}–${e.completionYear}` : e.completionYear, e.percentage != null ? `${e.percentage}%` : null, e.cgpa != null ? `CGPA ${e.cgpa}` : null, e.backlogs ? `${e.backlogs} backlog${e.backlogs > 1 ? "s" : ""}` : null, titleCase(e.status)].filter(Boolean).join(" · ")}</div>
          </div>
          {showStatus && e.reviewComment && (e.reviewStatus === "CHANGES_REQUESTED" || e.pendingData) && <p className="basis-full text-xs text-destructive">{e.reviewComment}</p>}
          {editable && <div className="flex gap-1"><Button size="icon-sm" variant="ghost" aria-label="Edit qualification" onClick={() => setEditing(e)}><PencilIcon /></Button>{!(showStatus && (e.reviewStatus === "VERIFIED" || e.reviewStatus === "SUBMITTED")) && <Button size="icon-sm" variant="ghost" aria-label="Remove qualification" onClick={() => remove(e)}><Trash2Icon /></Button>}</div>}
        </div>
      ))}
      {editable && <div><Button type="button" variant="outline" onClick={() => setEditing("new")}><PlusIcon />Add qualification</Button></div>}
      <EduDialog target={editing} onClose={() => setEditing(null)} onSaved={onChanged} />
    </div>
  )
}

function EduDialog({ target, onClose, onSaved }: { target: Edu | "new" | null; onClose: () => void; onSaved: () => void }) {
  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader><DialogTitle>{target === "new" ? "Add qualification" : "Edit qualification"}</DialogTitle><DialogDescription>Enter either a percentage or a CGPA. Marks cards are uploaded in the next step.</DialogDescription></DialogHeader>
        {target && <EduForm key={target === "new" ? "new" : target.id} target={target} onClose={onClose} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  )
}

function EduForm({ target, onClose, onSaved }: { target: Edu | "new"; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = React.useState(target === "new" ? blank : { level: target.level, qualification: target.qualification, specialisation: target.specialisation ?? "", institution: target.institution, boardOrUniversity: target.boardOrUniversity ?? "", admissionYear: String(target.admissionYear ?? ""), completionYear: String(target.completionYear ?? ""), percentage: String(target.percentage ?? ""), cgpa: String(target.cgpa ?? ""), backlogs: String(target.backlogs), status: target.status })
  const [busy, setBusy] = React.useState(false)
  const set = (k: keyof typeof blank, x: string) => setV((s) => ({ ...s, [k]: x }))
  async function save(e: React.FormEvent) {
    e.preventDefault()
    const a = num(v.admissionYear), c = num(v.completionYear), p = num(v.percentage), g = num(v.cgpa)
    if (!v.level) return void toast.error("Choose the level")
    if (a !== null && c !== null && c < a) return void toast.error("Completion year is before the admission year")
    if (p !== null && (p < 0 || p > 100)) return void toast.error("Percentage must be between 0 and 100")
    if (g !== null && (g < 0 || g > 10)) return void toast.error("CGPA must be between 0 and 10")
    setBusy(true)
    try {
      const body = { level: v.level, qualification: v.qualification.trim(), specialisation: v.specialisation.trim() || null, institution: v.institution.trim(), boardOrUniversity: v.boardOrUniversity.trim() || null, admissionYear: a, completionYear: c, percentage: p, cgpa: g, backlogs: Number(v.backlogs || 0), status: v.status }
      await api(target === "new" ? "/api/student/education" : `/api/student/education/${target.id}`, { method: target === "new" ? "POST" : "PUT", body })
      toast.success("Saved"); onClose(); onSaved()
    } catch (x) { toastError(x) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={save}>
      <FieldGroup>
        <Field><FieldLabel>Level</FieldLabel><OptionSelect className="w-full" value={v.level} onChange={(x) => setV((s) => ({ ...s, level: x, qualification: s.qualification || SUGGEST[x] || "" }))} options={LEVELS} placeholder="Choose a level" /></Field>
        <Text id="q" label="Qualification" value={v.qualification} onChange={(x) => set("qualification", x)} required hint="For example SSLC, PUC, B.Sc, B.E." />
        <Text id="sp" label="Specialisation" value={v.specialisation} onChange={(x) => set("specialisation", x)} />
        <Text id="in" label="Institution" value={v.institution} onChange={(x) => set("institution", x)} required />
        <Text id="bo" label="University / board" value={v.boardOrUniversity} onChange={(x) => set("boardOrUniversity", x)} />
        <div className="grid grid-cols-2 gap-3">
          <Text id="ay" label="Admission year" type="number" value={v.admissionYear} onChange={(x) => set("admissionYear", x)} />
          <Text id="cy" label="Completion year" type="number" value={v.completionYear} onChange={(x) => set("completionYear", x)} />
          <Text id="pc" label="Percentage" type="number" value={v.percentage} onChange={(x) => set("percentage", x)} />
          <Text id="cg" label="CGPA (out of 10)" type="number" value={v.cgpa} onChange={(x) => set("cgpa", x)} />
          <Text id="bl" label="Backlogs" type="number" value={v.backlogs} onChange={(x) => set("backlogs", x)} />
          <Field><FieldLabel>Status</FieldLabel><OptionSelect className="w-full" value={v.status} onChange={(x) => set("status", x)} options={STATUS} placeholder="Status" /></Field>
        </div>
      </FieldGroup>
      <DialogFooter className="mt-4"><Button type="submit" disabled={busy}>{busy && <Spinner />}Save</Button></DialogFooter>
    </form>
  )
}
