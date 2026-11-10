"use client"

import * as React from "react"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { SECTIONS } from "@/lib/mockTest"
import { ASSESSMENT_CATEGORIES } from "@/lib/reassessment"
import { api, toastError } from "@/lib/web/api"
import { useApi } from "@/lib/web/use-api"

type Bank = { id: string; name: string; _count: { questions: number } }
type Pick = { bankId: string; count: string; tag: string; difficulty: string }
const KINDS = ["Quantitative aptitude", "Logical reasoning", "Verbal ability", "Technical knowledge", "Programming", "Coding", "SQL", "Domain knowledge", "Company-specific simulation", "Case study"].map((v) => ({ value: v, label: v }))

/** Builds a test paper from one or more picks (each from a bank, optionally by topic and difficulty), with the job it prepares for, a test kind and section cut-offs. */
export function PaperBuilder({ open, banks, onClose, onDone }: { open: boolean; banks: Bank[]; onClose: () => void; onDone: () => void }) {
  const jds = useApi<{ id: string; title: string; companyName: string }[]>(open ? "/api/jds" : null, { status: "APPROVED" })
  const [f, setF] = React.useState({ title: "", category: "OTHER", kind: "", jdId: "", durationMin: "30", passPercent: "", instructions: "", cutoffs: "", shuffle: true })
  const [picks, setPicks] = React.useState<Pick[]>([{ bankId: "", count: "10", tag: "", difficulty: "" }])
  const [busy, setBusy] = React.useState(false)
  const setPick = (i: number, p: Partial<Pick>) => setPicks((a) => a.map((x, j) => (j === i ? { ...x, ...p } : x)))
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    try {
      const cutoffs = Object.fromEntries(f.cutoffs.split("\n").map((l) => l.split(":").map((x) => x.trim())).filter(([k, n]) => k && Number(n)).map(([k, n]) => [SECTIONS.find(([key, label]) => key === k.toLowerCase().replace(/\s+/g, "_") || label.toLowerCase() === k.toLowerCase())?.[0] ?? k.toLowerCase().replace(/\s+/g, "_"), Number(n)]))
      const r = await api<{ questions: number; totalMarks: number }>("/api/assessments/papers", { method: "POST", body: { title: f.title, category: f.category, durationMin: Number(f.durationMin), shuffle: f.shuffle, ...(f.passPercent ? { passPercent: Number(f.passPercent) } : {}), ...(f.instructions ? { instructions: f.instructions } : {}), ...(f.jdId ? { jdId: f.jdId } : {}), ...(f.kind ? { testKind: f.kind } : {}), sectionCutoffs: cutoffs, picks: picks.filter((p) => p.bankId).map((p) => ({ bankId: p.bankId, count: Number(p.count), ...(p.tag ? { tag: p.tag } : {}), ...(p.difficulty ? { difficulty: p.difficulty } : {}) })) } })
      toast.success(`Paper made: ${r.questions} questions, ${r.totalMarks} marks`); onDone(); onClose()
    } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Build a test paper</DialogTitle><DialogDescription>Questions are drawn at random from the banks you pick, and copied into the paper so later changes to a bank never alter it.</DialogDescription></DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-4"><FieldGroup>
          <Field><FieldLabel htmlFor="pb-t">Test name</FieldLabel><Input id="pb-t" required minLength={3} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2"><Field><FieldLabel>Test category</FieldLabel><OptionSelect className="w-full" value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={[{ value: "", label: "Not set" }, ...KINDS]} placeholder="Not set" /></Field><Field><FieldLabel>What it measures in the career profile</FieldLabel><OptionSelect className="w-full" value={f.category} onChange={(v) => setF({ ...f, category: v })} options={ASSESSMENT_CATEGORIES.map(([value, label]) => ({ value, label }))} placeholder="Choose" /></Field></div>
          <Field><FieldLabel>Related job description (optional)</FieldLabel><OptionSelect className="w-full" value={f.jdId} onChange={(v) => setF({ ...f, jdId: v })} options={[{ value: "", label: "None" }, ...(jds.data ?? []).map((j) => ({ value: j.id, label: `${j.title} (${j.companyName})` }))]} placeholder="None" /></Field>
          <div className="grid gap-3 sm:grid-cols-2"><Field><FieldLabel htmlFor="pb-d">Duration (minutes)</FieldLabel><Input id="pb-d" type="number" min={5} max={480} required value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: e.target.value })} /></Field><Field><FieldLabel htmlFor="pb-p">Overall pass mark (%)</FieldLabel><Input id="pb-p" type="number" min={1} max={100} value={f.passPercent} onChange={(e) => setF({ ...f, passPercent: e.target.value })} /></Field></div>
          <div className="flex flex-col gap-2"><span className="text-sm font-medium">Questions</span>
            {picks.map((p, i) => <div key={i} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_5rem_1fr_7rem_auto]">
              <OptionSelect className="w-full" value={p.bankId} onChange={(v) => setPick(i, { bankId: v })} options={banks.map((b) => ({ value: b.id, label: `${b.name} (${b._count.questions})` }))} placeholder="From bank" />
              <Input aria-label="How many" type="number" min={1} value={p.count} onChange={(e) => setPick(i, { count: e.target.value })} />
              <Input aria-label="Topic" placeholder="Topic (optional)" value={p.tag} onChange={(e) => setPick(i, { tag: e.target.value })} />
              <OptionSelect className="w-full" value={p.difficulty} onChange={(v) => setPick(i, { difficulty: v })} options={[{ value: "", label: "Any level" }, { value: "EASY", label: "Easy" }, { value: "MEDIUM", label: "Medium" }, { value: "HARD", label: "Hard" }]} placeholder="Any level" />
              <Button type="button" size="sm" variant="ghost" disabled={picks.length === 1} onClick={() => setPicks((a) => a.filter((_, j) => j !== i))}>Remove</Button></div>)}
            <div><Button type="button" size="sm" variant="outline" onClick={() => setPicks((a) => [...a, { bankId: "", count: "5", tag: "", difficulty: "" }])}>Add another pick</Button></div></div>
          <Field><FieldLabel htmlFor="pb-c">Minimum per section, one per line, like &quot;SQL: 50&quot; (a student must reach each as well as the overall mark)</FieldLabel><Textarea id="pb-c" value={f.cutoffs} onChange={(e) => setF({ ...f, cutoffs: e.target.value })} /></Field>
          <Field><FieldLabel htmlFor="pb-i">Instructions</FieldLabel><Textarea id="pb-i" value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.shuffle} onChange={(e) => setF({ ...f, shuffle: e.target.checked })} />Show the questions in a different order to each student</label>
        </FieldGroup><DialogFooter><Button type="submit" disabled={busy || !picks.some((p) => p.bankId)}>{busy && <Spinner />}Build the paper</Button></DialogFooter></form>
      </DialogContent>
    </Dialog>
  )
}
