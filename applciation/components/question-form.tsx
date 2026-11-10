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
import { QTYPES, QTYPE_LABEL, SECTIONS, type QType } from "@/lib/mockTest"
import { api, toastError } from "@/lib/web/api"

const LANGS = ["python", "java", "javascript", "c", "c++", "sql", "other"].map((v) => ({ value: v, label: v }))
type V = { type: QType; text: string; context: string; section: string; options: string; correct: string; accepted: string; modelAnswer: string; rubric: string; language: string; marks: string; negative: string; explanation: string; difficulty: string; tags: string }
const BLANK: V = { type: "SINGLE", text: "", context: "", section: "", options: "", correct: "", accepted: "", modelAnswer: "", rubric: "", language: "", marks: "1", negative: "0", explanation: "", difficulty: "", tags: "" }

/** Adds a question to a bank. The form changes with the kind of question. */
export function QuestionForm({ bank, onClose, onDone }: { bank: { id: string; name: string } | null; onClose: () => void; onDone: () => void }) {
  const [v, setV] = React.useState<V>(BLANK)
  const [busy, setBusy] = React.useState(false)
  const set = (p: Partial<V>) => setV((o) => ({ ...o, ...p }))
  const choice = v.type === "SINGLE" || v.type === "MULTIPLE" || v.type === "TRUE_FALSE"
  const open = v.type === "DESCRIPTIVE" || v.type === "CODING" || v.type === "SQL"
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    try {
      const options = v.type === "TRUE_FALSE" ? ["True", "False"] : v.options.split("\n").map((s) => s.trim()).filter(Boolean)
      const correct = v.type === "TRUE_FALSE" ? [v.correct === "false" ? 1 : 0] : v.correct.split(",").map((s) => Number(s.trim()) - 1).filter((n) => Number.isFinite(n))
      const q = { type: v.type, text: v.text, ...(v.context ? { context: v.context } : {}), ...(v.section ? { section: v.section } : {}), marks: Number(v.marks || 1), negativeMarks: Number(v.negative || 0), ...(v.explanation ? { explanation: v.explanation } : {}), ...(v.difficulty ? { difficulty: v.difficulty } : {}), tags: v.tags.split(",").map((s) => s.trim()).filter(Boolean), ...(choice ? { options, correct } : {}), ...(v.type === "FILL_BLANK" ? { acceptedAnswers: v.accepted.split("\n").map((s) => s.trim()).filter(Boolean) } : {}), ...(open ? { modelAnswer: v.modelAnswer || undefined, rubric: v.rubric || undefined, language: v.language || undefined } : {}) }
      await api(`/api/assessments/banks/${bank!.id}/questions`, { method: "POST", body: { questions: [q] } })
      toast.success("Question added"); setV({ ...BLANK, type: v.type, section: v.section, tags: v.tags }); onDone()
    } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  return (
    <Dialog open={!!bank} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Add a question to {bank?.name}</DialogTitle><DialogDescription>Choose the kind of question. Descriptive, coding and SQL answers are marked by the AI against your model answer, and you can correct any mark. Code is read, not run.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field><FieldLabel>Kind of question</FieldLabel><OptionSelect className="w-full" value={v.type} onChange={(t) => set({ type: t as QType })} options={QTYPES.map((t) => ({ value: t, label: QTYPE_LABEL[t] }))} placeholder="Kind" /></Field>
            <Field><FieldLabel htmlFor="q-ctx">Case study or scenario shown above the question (optional; give the same text to several questions to make a case study)</FieldLabel><Textarea id="q-ctx" value={v.context} onChange={(e) => set({ context: e.target.value })} /></Field>
            <Field><FieldLabel htmlFor="q-text">Question</FieldLabel><Textarea id="q-text" required minLength={5} value={v.text} onChange={(e) => set({ text: e.target.value })} /></Field>
            {choice && v.type !== "TRUE_FALSE" && <><Field><FieldLabel htmlFor="q-opt">Options, one per line</FieldLabel><Textarea id="q-opt" required value={v.options} onChange={(e) => set({ options: e.target.value })} /></Field><Field><FieldLabel htmlFor="q-cor">Number of the right option{v.type === "MULTIPLE" ? "s, separated by commas" : ""}</FieldLabel><Input id="q-cor" required placeholder={v.type === "MULTIPLE" ? "1, 3" : "2"} value={v.correct} onChange={(e) => set({ correct: e.target.value })} /></Field></>}
            {v.type === "TRUE_FALSE" && <Field><FieldLabel>The statement is</FieldLabel><OptionSelect className="w-full" value={v.correct || "true"} onChange={(c) => set({ correct: c })} options={[{ value: "true", label: "True" }, { value: "false", label: "False" }]} placeholder="True or false" /></Field>}
            {v.type === "FILL_BLANK" && <Field><FieldLabel htmlFor="q-acc">Answers that count as right, one per line</FieldLabel><Textarea id="q-acc" required value={v.accepted} onChange={(e) => set({ accepted: e.target.value })} /></Field>}
            {open && <>
              {(v.type === "CODING" || v.type === "SQL") && <Field><FieldLabel>Language</FieldLabel><OptionSelect className="w-full" value={v.language || (v.type === "SQL" ? "sql" : "")} onChange={(l) => set({ language: l })} options={LANGS} placeholder="Language" /></Field>}
              <Field><FieldLabel htmlFor="q-model">Model answer</FieldLabel><Textarea id="q-model" className="min-h-24 font-mono text-xs" value={v.modelAnswer} onChange={(e) => set({ modelAnswer: e.target.value })} /></Field>
              <Field><FieldLabel htmlFor="q-rub">What to look for (points that earn marks)</FieldLabel><Textarea id="q-rub" value={v.rubric} onChange={(e) => set({ rubric: e.target.value })} /></Field>
            </>}
            <div className="grid grid-cols-2 gap-3"><Field><FieldLabel htmlFor="q-m">Marks</FieldLabel><Input id="q-m" type="number" min={1} value={v.marks} onChange={(e) => set({ marks: e.target.value })} /></Field>{!open && <Field><FieldLabel htmlFor="q-n">Marks lost for a wrong answer</FieldLabel><Input id="q-n" type="number" min={0} step="0.25" value={v.negative} onChange={(e) => set({ negative: e.target.value })} /></Field>}</div>
            <div className="grid grid-cols-2 gap-3"><Field><FieldLabel>Section</FieldLabel><OptionSelect className="w-full" value={v.section} onChange={(s) => set({ section: s })} options={[{ value: "", label: "From the tags" }, ...SECTIONS.map(([value, label]) => ({ value, label }))]} placeholder="From the tags" /></Field><Field><FieldLabel>Difficulty</FieldLabel><OptionSelect className="w-full" value={v.difficulty} onChange={(d) => set({ difficulty: d })} options={[{ value: "", label: "Not set" }, { value: "EASY", label: "Easy" }, { value: "MEDIUM", label: "Medium" }, { value: "HARD", label: "Hard" }]} placeholder="Not set" /></Field></div>
            <Field><FieldLabel htmlFor="q-tags">Topics, separated by commas (they drive the topic report and the targeted practice)</FieldLabel><Input id="q-tags" placeholder="joins, subqueries" value={v.tags} onChange={(e) => set({ tags: e.target.value })} /></Field>
            <Field><FieldLabel htmlFor="q-exp">Explanation (shown in the report)</FieldLabel><Textarea id="q-exp" value={v.explanation} onChange={(e) => set({ explanation: e.target.value })} /></Field>
          </FieldGroup>
          <DialogFooter><Button type="submit" disabled={busy}>{busy && <Spinner />}Add question</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
