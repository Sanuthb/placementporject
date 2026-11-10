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
import { PaperCategory, RetakeRules } from "@/components/assessment-rules"
import { ASSESSMENT_CATEGORIES } from "@/lib/reassessment"
import { StarterBanks } from "@/components/starter-banks"
import { AssessmentReport } from "@/components/assessment-report"
import { AnswerMarking } from "@/components/answer-marking"
import { PaperBuilder } from "@/components/paper-builder"
import { QuestionForm } from "@/components/question-form"
import { useApi } from "@/lib/web/use-api"

type Bank = { id: string; name: string; topic: string | null; _count: { questions: number } }
type Paper = { id: string; title: string; category: string; durationMin: number; questions: number }
type Sched = { id: string; title: string; startsAt: string; endsAt: string; isBaseline: boolean; isPractice?: boolean; paper: { title: string }; _count: { attempts: number } }

export default function AssessmentsPage() {
  const lk = useLookups()
  const banks = useApi<Bank[]>("/api/assessments/banks")
  const papers = useApi<Paper[]>("/api/assessments/papers")
  const [bank, setBank] = React.useState<Bank | null>(null)
  const [build, setBuild] = React.useState(false)
  return (
    <Tabs defaultValue="banks">
      <TabsList><TabsTrigger value="banks">Question banks</TabsTrigger><TabsTrigger value="papers">Papers</TabsTrigger><TabsTrigger value="marking">To mark</TabsTrigger><TabsTrigger value="schedules">Schedules and results</TabsTrigger><TabsTrigger value="reports">Reports</TabsTrigger><TabsTrigger value="rules">Retake rules</TabsTrigger></TabsList>
      <TabsContent value="reports"><AssessmentReport /></TabsContent>
      <TabsContent value="rules"><RetakeRules /></TabsContent>
      <TabsContent value="banks" className="flex flex-col gap-4">
        <StarterBanks onImported={() => { banks.reload(); papers.reload() }} />
        <MasterTab<Bank> endpoint="/api/assessments/banks" addLabel="New question bank"
          fields={[{ name: "name", label: "Name" }, { name: "topic", label: "Topic", required: false }]}
          columns={[{ label: "Bank", cell: (r) => <>{r.name}<div className="text-xs text-muted-foreground">{r.topic}</div></> }, { label: "Questions", cell: (r) => r._count.questions }, { label: "Add", cell: (r) => <Button size="sm" variant="outline" onClick={() => setBank(r)}>Add question</Button> }]} />
      </TabsContent>
      <TabsContent value="papers" className="flex flex-col gap-3">
        <div><Button onClick={() => setBuild(true)}>Build a paper</Button></div>
        <MasterTab<Paper> endpoint="/api/assessments/papers" addLabel="" fields={[]}
          columns={[{ label: "Paper", cell: (r) => r.title }, { label: "Measures", cell: (r, reload) => <PaperCategory paper={r} onSaved={reload} /> }, { label: "Duration", cell: (r) => `${r.durationMin} min` }, { label: "Questions", cell: (r) => r.questions }]} />
      </TabsContent>
      <TabsContent value="marking"><AnswerMarking /></TabsContent>
      <TabsContent value="schedules">
        <MasterTab<Sched> endpoint="/api/assessments/schedules" addLabel="Schedule an assessment"
          fields={[{ name: "paperId", label: "Paper", type: "select", required: true, options: (papers.data ?? []).map((p) => ({ value: p.id, label: p.title })) }, { name: "title", label: "Title" }, { name: "date", label: "Date", type: "date" }, { name: "start", label: "Opens at (24h)" }, { name: "end", label: "Closes at (24h)" }, { name: "departmentId", label: "Department (optional)", type: "select", required: false, options: lk.departments }, { name: "batchId", label: "Batch (optional)", type: "select", required: false, options: lk.batches }, { name: "isBaseline", label: "This is the baseline diagnostic test", type: "checkbox" }, { name: "isPractice", label: "Practice test: students see answers and explanations right after submitting", type: "checkbox", required: false }, { name: "maxAttempts", label: "Attempts allowed (empty = follow the retake rule)", type: "number", required: false }, { name: "resultVisibility", label: "What students see afterwards", type: "select", required: false, options: [{ value: "SCORE_ONLY", label: "Score only" }, { value: "ANALYSIS", label: "Score and analysis (no answers)" }, { value: "AFTER_END", label: "Analysis now, answers after the window closes" }, { value: "IMMEDIATE", label: "Everything, straight away" }] }]}
          toBody={(v) => ({ paperId: v.paperId, title: v.title, startsAt: new Date(`${v.date}T${v.start}`).toISOString(), endsAt: new Date(`${v.date}T${v.end}`).toISOString(), isBaseline: !!v.isBaseline, isPractice: !!v.isPractice, ...(v.maxAttempts ? { maxAttempts: Number(v.maxAttempts) } : {}), ...(v.resultVisibility ? { resultVisibility: v.resultVisibility } : {}), targetDepartmentIds: v.departmentId ? [v.departmentId] : [], targetBatchIds: v.batchId ? [v.batchId] : [] })}
          columns={[{ label: "Assessment", cell: (r) => <>{r.title} {r.isBaseline && <Badge variant="secondary">Baseline</Badge>}{r.isPractice && <Badge variant="outline">Practice</Badge>}<div className="text-xs text-muted-foreground">{r.paper.title}</div></> }, { label: "Window", cell: (r) => `${fmtDateTime(r.startsAt)} to ${fmtDateTime(r.endsAt)}` }, { label: "Attempts", cell: (r) => r._count.attempts }, { label: "Results", cell: (r) => <Button size="sm" variant="outline" onClick={() => download(`/api/assessments/schedules/${r.id}/results`, { query: { format: "xlsx" } }).catch(toastError)}>Download</Button> }]} />
      </TabsContent>
      <QuestionForm bank={bank} onClose={() => setBank(null)} onDone={banks.reload} />
      <PaperBuilder open={build} banks={banks.data ?? []} onClose={() => setBuild(false)} onDone={papers.reload} />
    </Tabs>
  )
}
