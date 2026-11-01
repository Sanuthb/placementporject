"use client"

import * as React from "react"
import { toast } from "sonner"

import { MasterTab } from "@/components/master-tab"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api, download, toastError } from "@/lib/web/api"
import { fmtDateTime } from "@/lib/web/format"
import { useLookups } from "@/lib/web/lookups"
import { useApi } from "@/lib/web/use-api"

type Bank = { id: string; name: string; topic: string | null; _count: { questions: number } }
type Paper = { id: string; title: string; durationMin: number; questions: number }
type Sched = { id: string; title: string; startsAt: string; endsAt: string; isBaseline: boolean; isPractice?: boolean; paper: { title: string }; _count: { attempts: number } }

export default function AssessmentsPage() {
  const lk = useLookups()
  const banks = useApi<Bank[]>("/api/assessments/banks")
  const papers = useApi<Paper[]>("/api/assessments/papers")
  const [bank, setBank] = React.useState<Bank | null>(null)
  return (
    <Tabs defaultValue="banks">
      <TabsList><TabsTrigger value="banks">Question banks</TabsTrigger><TabsTrigger value="papers">Papers</TabsTrigger><TabsTrigger value="schedules">Schedules and results</TabsTrigger></TabsList>
      <TabsContent value="banks">
        <MasterTab<Bank> endpoint="/api/assessments/banks" addLabel="New question bank"
          fields={[{ name: "name", label: "Name" }, { name: "topic", label: "Topic", required: false }]}
          columns={[{ label: "Bank", cell: (r) => <>{r.name}<div className="text-xs text-muted-foreground">{r.topic}</div></> }, { label: "Questions", cell: (r) => r._count.questions }, { label: "Add", cell: (r) => <Button size="sm" variant="outline" onClick={() => setBank(r)}>Add question</Button> }]} />
      </TabsContent>
      <TabsContent value="papers">
        <MasterTab<Paper> endpoint="/api/assessments/papers" addLabel="Create paper"
          fields={[{ name: "title", label: "Title" }, { name: "durationMin", label: "Duration (minutes)", type: "number" }, { name: "passPercent", label: "Pass mark (%)", type: "number", required: false }, { name: "bankId", label: "Pick questions from", type: "select", required: true, options: (banks.data ?? []).map((b) => ({ value: b.id, label: `${b.name} (${b._count.questions})` })) }, { name: "count", label: "Number of questions", type: "number" }, { name: "instructions", label: "Instructions", type: "textarea", required: false }]}
          toBody={(v) => ({ title: v.title, durationMin: Number(v.durationMin), ...(v.passPercent ? { passPercent: Number(v.passPercent) } : {}), random: { bankId: v.bankId, count: Number(v.count) }, ...(v.instructions ? { instructions: v.instructions } : {}) })}
          columns={[{ label: "Paper", cell: (r) => r.title }, { label: "Duration", cell: (r) => `${r.durationMin} min` }, { label: "Questions", cell: (r) => r.questions }]} />
      </TabsContent>
      <TabsContent value="schedules">
        <MasterTab<Sched> endpoint="/api/assessments/schedules" addLabel="Schedule an assessment"
          fields={[{ name: "paperId", label: "Paper", type: "select", required: true, options: (papers.data ?? []).map((p) => ({ value: p.id, label: p.title })) }, { name: "title", label: "Title" }, { name: "date", label: "Date", type: "date" }, { name: "start", label: "Opens at (24h)" }, { name: "end", label: "Closes at (24h)" }, { name: "departmentId", label: "Department (optional)", type: "select", required: false, options: lk.departments }, { name: "batchId", label: "Batch (optional)", type: "select", required: false, options: lk.batches }, { name: "isBaseline", label: "This is the baseline diagnostic test", type: "checkbox" }, { name: "isPractice", label: "Practice test: students see answers and explanations right after submitting", type: "checkbox", required: false }]}
          toBody={(v) => ({ paperId: v.paperId, title: v.title, startsAt: new Date(`${v.date}T${v.start}`).toISOString(), endsAt: new Date(`${v.date}T${v.end}`).toISOString(), isBaseline: !!v.isBaseline, isPractice: !!v.isPractice, targetDepartmentIds: v.departmentId ? [v.departmentId] : [], targetBatchIds: v.batchId ? [v.batchId] : [] })}
          columns={[{ label: "Assessment", cell: (r) => <>{r.title} {r.isBaseline && <Badge variant="secondary">Baseline</Badge>}{r.isPractice && <Badge variant="outline">Practice</Badge>}<div className="text-xs text-muted-foreground">{r.paper.title}</div></> }, { label: "Window", cell: (r) => `${fmtDateTime(r.startsAt)} to ${fmtDateTime(r.endsAt)}` }, { label: "Attempts", cell: (r) => r._count.attempts }, { label: "Results", cell: (r) => <Button size="sm" variant="outline" onClick={() => download(`/api/assessments/schedules/${r.id}/results`, { query: { format: "xlsx" } }).catch(toastError)}>Download</Button> }]} />
      </TabsContent>
      <AddQuestion bank={bank} onClose={() => setBank(null)} onDone={banks.reload} />
    </Tabs>
  )
}

function AddQuestion({ bank, onClose, onDone }: { bank: Bank | null; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false)
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const options = String(f.get("options")).split("\n").map((s) => s.trim()).filter(Boolean)
    const correct = String(f.get("correct")).split(",").map((s) => Number(s.trim()) - 1)
    setBusy(true)
    try { await api(`/api/assessments/banks/${bank!.id}/questions`, { method: "POST", body: { questions: [{ text: f.get("text"), options, correct, marks: Number(f.get("marks") || 1), negativeMarks: Number(f.get("neg") || 0), ...(f.get("explanation") ? { explanation: String(f.get("explanation")) } : {}), tags: [] }] } }); toast.success("Question added"); onClose(); onDone() } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  return (
    <Dialog open={!!bank} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add a question to {bank?.name}</DialogTitle><DialogDescription>Multiple choice. Give the options one per line, then the number(s) of the correct option.</DialogDescription></DialogHeader>
        <form onSubmit={submit}>
          <FieldGroup>
            <Field><FieldLabel htmlFor="text">Question</FieldLabel><Textarea id="text" name="text" minLength={5} required /></Field>
            <Field><FieldLabel htmlFor="explanation">Explanation (shown in practice tests)</FieldLabel><Textarea id="explanation" name="explanation" /></Field>
            <Field><FieldLabel htmlFor="options">Options (one per line)</FieldLabel><Textarea id="options" name="options" required /></Field>
            <Field><FieldLabel htmlFor="correct">Correct option number(s), separated by commas</FieldLabel><Input id="correct" name="correct" placeholder="2" required /></Field>
            <div className="grid grid-cols-2 gap-3"><Field><FieldLabel htmlFor="marks">Marks</FieldLabel><Input id="marks" name="marks" type="number" min={1} defaultValue={1} /></Field><Field><FieldLabel htmlFor="neg">Negative marks</FieldLabel><Input id="neg" name="neg" type="number" min={0} step="0.25" defaultValue={0} /></Field></div>
          </FieldGroup>
          <DialogFooter className="mt-4"><Button type="submit" disabled={busy}>{busy && <Spinner />}Add question</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
