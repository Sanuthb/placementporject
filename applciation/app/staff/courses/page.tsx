"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { PlusIcon } from "lucide-react"

import { OptionSelect } from "@/components/option-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, titleCase } from "@/lib/web/format"
import { useLookups } from "@/lib/web/lookups"
import { useApi } from "@/lib/web/use-api"

type Row = { id: string; title: string; category: string | null; level: string | null; status: string; lessons: number; enrolled: number; completed: number; completionPercent: number; publishedAt: string | null }
const LEVELS = [{ value: "BEGINNER", label: "Beginner" }, { value: "INTERMEDIATE", label: "Intermediate" }, { value: "ADVANCED", label: "Advanced" }]

type Summary = {
  courses: { published: number; draft: number; archived: number }; enrolments: number; learners: number; activeStudents: number; learnerPercent: number; completed: number; completionPercent: number
  active: number; notStarted: number; stalled: number; assignmentsToGrade: number; unansweredQuestions: number
  byDepartment: { department: string; learners: number; enrolments: number; completionPercent: number }[]; topCourses: { title: string; enrolled: number; completed: number; completionPercent: number }[]
}
const Stat = ({ label, value }: { label: string; value: React.ReactNode }) => <Card size="sm"><CardHeader><CardDescription>{label}</CardDescription><CardTitle className="text-2xl">{value}</CardTitle></CardHeader></Card>

/** All courses with enrolment and completion at a glance, and a form to start a new one. */
export default function CoursesPage() {
  const { data } = useApi<Row[]>("/api/courses")
  const sum = useApi<Summary>("/api/courses/summary")
  const lk = useLookups()
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [v, setV] = React.useState({ title: "", summary: "", category: "", level: "", departmentId: "", batchId: "" })
  const set = (k: keyof typeof v) => (x: string) => setV((o) => ({ ...o, [k]: x }))

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const body = Object.fromEntries(Object.entries(v).filter(([, x]) => x))
      const c = await api<{ id: string }>("/api/courses", { method: "POST", body })
      router.push(`/staff/courses/${c.id}`)
    } catch (err) { toastError(err); setBusy(false) }
  }

  if (!data) return <Skeleton className="h-64" />
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Build courses from modules and lessons, publish them, and track who is learning.</p>
        <Button onClick={() => setOpen(true)}><PlusIcon />New course</Button>
      </div>
      {sum.data && (
        <section className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Published courses" value={sum.data.courses.published} /><Stat label="Students learning" value={`${sum.data.learners} (${sum.data.learnerPercent}%)`} />
            <Stat label="Completion" value={`${sum.data.completionPercent}%`} /><Stat label="Gone quiet (14+ days)" value={sum.data.stalled} />
            <Stat label="Active now" value={sum.data.active} /><Stat label="Not started" value={sum.data.notStarted} />
            <Stat label="Assignments to grade" value={sum.data.assignmentsToGrade} /><Stat label="Unanswered questions" value={sum.data.unansweredQuestions} />
          </div>
          {sum.data.byDepartment.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2">
              <Card size="sm"><CardHeader><CardTitle>By department</CardTitle></CardHeader><CardContent className="flex flex-col gap-1 text-sm">{sum.data.byDepartment.map((d) => <div key={d.department} className="flex justify-between gap-3"><span>{d.department}</span><span className="text-muted-foreground">{d.learners} learners · {d.completionPercent}% complete</span></div>)}</CardContent></Card>
              <Card size="sm"><CardHeader><CardTitle>Busiest courses</CardTitle></CardHeader><CardContent className="flex flex-col gap-1 text-sm">{sum.data.topCourses.map((c) => <div key={c.title} className="flex justify-between gap-3"><span>{c.title}</span><span className="text-muted-foreground">{c.enrolled} joined · {c.completionPercent}% complete</span></div>)}</CardContent></Card>
            </div>
          )}
        </section>
      )}
      <Table>
        <TableHeader><TableRow><TableHead>Course</TableHead><TableHead>Status</TableHead><TableHead>Lessons</TableHead><TableHead>Students</TableHead><TableHead className="w-48">Completion</TableHead><TableHead>Published</TableHead></TableRow></TableHeader>
        <TableBody>
          {data.map((c) => (
            <TableRow key={c.id}>
              <TableCell><Link className="font-medium underline-offset-4 hover:underline" href={`/staff/courses/${c.id}`}>{c.title}</Link><div className="text-xs text-muted-foreground">{[c.category, c.level && titleCase(c.level)].filter(Boolean).join(" · ")}</div></TableCell>
              <TableCell><Badge variant={c.status === "PUBLISHED" ? "default" : "outline"}>{titleCase(c.status)}</Badge></TableCell>
              <TableCell>{c.lessons}</TableCell>
              <TableCell>{c.enrolled}</TableCell>
              <TableCell><div className="flex items-center gap-2"><Progress value={c.completionPercent} /><span className="text-xs text-muted-foreground">{c.completed}/{c.enrolled}</span></div></TableCell>
              <TableCell>{fmtDate(c.publishedAt)}</TableCell>
            </TableRow>
          ))}
          {data.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No courses yet. Start one with New course.</TableCell></TableRow>}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New course</DialogTitle></DialogHeader>
          <form onSubmit={create} className="flex flex-col gap-4">
            <FieldGroup>
              <Field><FieldLabel htmlFor="c-title">Title</FieldLabel><Input id="c-title" required minLength={3} value={v.title} onChange={(e) => set("title")(e.target.value)} /></Field>
              <Field><FieldLabel htmlFor="c-sum">Short description</FieldLabel><Textarea id="c-sum" maxLength={500} value={v.summary} onChange={(e) => set("summary")(e.target.value)} /></Field>
              <Field><FieldLabel htmlFor="c-cat">Category (for example Aptitude, Programming)</FieldLabel><Input id="c-cat" value={v.category} onChange={(e) => set("category")(e.target.value)} /></Field>
              <Field><FieldLabel>Level</FieldLabel><OptionSelect className="w-full" value={v.level} onChange={set("level")} options={LEVELS} placeholder="Choose level" /></Field>
              <Field><FieldLabel>Only for one department (optional)</FieldLabel><OptionSelect className="w-full" value={v.departmentId} onChange={set("departmentId")} options={lk.departments} placeholder="Every department" /></Field>
              <Field><FieldLabel>Only for one batch (optional)</FieldLabel><OptionSelect className="w-full" value={v.batchId} onChange={set("batchId")} options={lk.batches} placeholder="Every batch" /></Field>
            </FieldGroup>
            <DialogFooter><Button type="submit" disabled={busy}>{busy && <Spinner />}Create draft</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
