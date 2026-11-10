"use client"

import * as React from "react"
import { toast } from "sonner"

import { StudentPicker } from "@/components/master-tab"
import { OptionSelect } from "@/components/option-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, fmtDateTime, titleCase } from "@/lib/web/format"
import { useLookups } from "@/lib/web/lookups"
import { useApi } from "@/lib/web/use-api"

const ENG: Record<string, "default" | "secondary" | "destructive" | "outline"> = { COMPLETED: "default", ACTIVE: "secondary", NOT_STARTED: "outline", STALLED: "destructive" }

type Row = { enrolmentId: string; student: { id: string; name: string; enrollmentNo: string }; status: string; percent: number; lessonsDone: number; lessonsTotal: number; avgQuizPercent: number | null; assignmentsToGrade: number; certificate: string | null; lastActivityAt: string; engagement: string; selfEnrolled: boolean }

/** Who is in the course and how they are doing, plus a form to enrol more students. */
export function CourseStudents({ id, published }: { id: string; published: boolean }) {
  const { data, reload } = useApi<Row[]>(`/api/courses/${id}/enrolments`)
  const lk = useLookups()
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [f, setF] = React.useState({ studentId: "", departmentId: "", batchId: "" })
  if (!data) return <Skeleton className="h-48" />

  async function enrol(e: React.FormEvent) {
    e.preventDefault()
    const body = f.studentId ? { studentIds: [f.studentId] } : { ...(f.departmentId ? { departmentId: f.departmentId } : {}), ...(f.batchId ? { batchId: f.batchId } : {}) }
    setBusy(true)
    try {
      const r = await api<{ added: number; alreadyIn: number }>(`/api/courses/${id}/enrolments`, { method: "POST", body })
      toast.success(`${r.added} enrolled${r.alreadyIn ? `, ${r.alreadyIn} already in the course` : ""}`)
      setOpen(false); setF({ studentId: "", departmentId: "", batchId: "" }); reload()
    } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end"><Button disabled={!published} onClick={() => setOpen(true)}>Enrol students</Button></div>
      {!published && <p className="text-sm text-muted-foreground">Publish the course to enrol students.</p>}
      <Table>
        <TableHeader><TableRow><TableHead>Student</TableHead><TableHead className="w-44">Progress</TableHead><TableHead>Quiz average</TableHead><TableHead>To grade</TableHead><TableHead>State</TableHead><TableHead>Last active</TableHead><TableHead>Certificate</TableHead></TableRow></TableHeader>
        <TableBody>
          {data.map((r) => (
            <TableRow key={r.enrolmentId}>
              <TableCell>{r.student.name}<div className="text-xs text-muted-foreground">{r.student.enrollmentNo}{r.selfEnrolled ? " · joined on their own" : ""}</div></TableCell>
              <TableCell><div className="flex items-center gap-2"><Progress value={r.percent} /><span className="text-xs text-muted-foreground">{r.lessonsDone}/{r.lessonsTotal}</span></div></TableCell>
              <TableCell>{r.avgQuizPercent === null ? "—" : `${r.avgQuizPercent}%`}</TableCell>
              <TableCell>{r.assignmentsToGrade || "—"}</TableCell>
              <TableCell>{r.status === "WITHDRAWN" ? <Badge variant="outline">Left</Badge> : <Badge variant={ENG[r.engagement]}>{titleCase(r.engagement)}</Badge>}</TableCell>
              <TableCell>{fmtDate(r.lastActivityAt)}</TableCell>
              <TableCell className="text-xs">{r.certificate ?? "—"}</TableCell>
            </TableRow>
          ))}
          {data.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Nobody has joined yet.</TableCell></TableRow>}
        </TableBody>
      </Table>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Enrol students</DialogTitle></DialogHeader>
          <form onSubmit={enrol} className="flex flex-col gap-4">
            <FieldGroup>
              <Field><FieldLabel>One student</FieldLabel><StudentPicker value={f.studentId} onChange={(v) => setF({ studentId: v, departmentId: "", batchId: "" })} /></Field>
              <p className="text-xs text-muted-foreground">Or a whole group:</p>
              <Field><FieldLabel>Department</FieldLabel><OptionSelect className="w-full" value={f.departmentId} onChange={(v) => setF((o) => ({ ...o, studentId: "", departmentId: v }))} options={lk.departments} placeholder="Choose department" /></Field>
              <Field><FieldLabel>Batch</FieldLabel><OptionSelect className="w-full" value={f.batchId} onChange={(v) => setF((o) => ({ ...o, studentId: "", batchId: v }))} options={lk.batches} placeholder="Choose batch" /></Field>
            </FieldGroup>
            <DialogFooter><Button type="submit" disabled={busy || !(f.studentId || f.departmentId || f.batchId)}>{busy && <Spinner />}Enrol</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

type Sub = { id: string; status: string; text: string | null; fileName: string | null; fileUrl: string | null; marks: number | null; feedback: string | null; submittedAt: string; late: boolean; student: { name: string; enrollmentNo: string }; lesson: { id: string; title: string; maxMarks: number | null } }
type MiniModule = { id: string; title: string; lessons: { id: string; type: string; title: string; startsAt: string | null }[] }

/** Assignments waiting to be graded, and attendance for live sessions. */
export function CourseGrading({ id, modules }: { id: string; modules: MiniModule[] }) {
  const [status, setStatus] = React.useState("SUBMITTED")
  const { data, reload } = useApi<Sub[]>(`/api/courses/${id}/submissions`, { status: status === "ALL" ? undefined : status })
  const [grading, setGrading] = React.useState<Sub | null>(null)
  const live = modules.flatMap((m) => m.lessons).filter((l) => l.type === "LIVE")
  const [attend, setAttend] = React.useState<string | null>(null)
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between"><h2 className="font-medium">Assignments</h2><OptionSelect className="w-44" value={status} onChange={setStatus} options={[{ value: "SUBMITTED", label: "To grade" }, { value: "GRADED", label: "Graded" }, { value: "RETURNED", label: "Sent back" }, { value: "ALL", label: "All" }]} placeholder="Show" /></div>
        {!data ? <Skeleton className="h-32" /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Assignment</TableHead><TableHead>Handed in</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {data.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.student.name}<div className="text-xs text-muted-foreground">{s.student.enrollmentNo}</div></TableCell>
                  <TableCell>{s.lesson.title}</TableCell>
                  <TableCell>{fmtDateTime(s.submittedAt)} {s.late && <Badge variant="destructive">Late</Badge>}</TableCell>
                  <TableCell>{titleCase(s.status)}{s.marks !== null && ` · ${s.marks}/${s.lesson.maxMarks}`}</TableCell>
                  <TableCell><Button size="sm" variant="outline" onClick={() => setGrading(s)}>{s.status === "SUBMITTED" ? "Open and grade" : "Open"}</Button></TableCell>
                </TableRow>
              ))}
              {data.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nothing here.</TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Live sessions</h2>
        {live.length === 0 && <p className="text-sm text-muted-foreground">This course has no live sessions.</p>}
        {live.map((l) => <div key={l.id} className="flex items-center justify-between rounded-md border p-2 text-sm"><span>{l.title} <span className="text-muted-foreground">· {fmtDateTime(l.startsAt)}</span></span><Button size="sm" variant="outline" onClick={() => setAttend(l.id)}>Mark attendance</Button></div>)}
      </section>
      {grading && <GradeDialog courseId={id} sub={grading} onClose={() => setGrading(null)} onDone={() => { setGrading(null); reload() }} />}
      {attend && <AttendanceDialog courseId={id} lessonId={attend} onClose={() => setAttend(null)} />}
    </div>
  )
}

function GradeDialog({ courseId, sub, onClose, onDone }: { courseId: string; sub: Sub; onClose: () => void; onDone: () => void }) {
  const [marks, setMarks] = React.useState(String(sub.marks ?? ""))
  const [feedback, setFeedback] = React.useState(sub.feedback ?? "")
  const [busy, setBusy] = React.useState(false)
  async function send(body: object, ok: string) {
    setBusy(true)
    try { await api(`/api/courses/${courseId}/submissions/${sub.id}`, { method: "PATCH", body }); toast.success(ok); onDone() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  const graded = sub.status === "GRADED"
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{sub.student.name}: {sub.lesson.title}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3 text-sm">
          {sub.text && <p className="whitespace-pre-wrap rounded-md border p-3">{sub.text}</p>}
          {sub.fileUrl && <a className="underline underline-offset-4" href={sub.fileUrl} target="_blank" rel="noreferrer">Open {sub.fileName}</a>}
          {graded ? <p>Graded {sub.marks}/{sub.lesson.maxMarks}. {sub.feedback}</p> : (
            <FieldGroup>
              <Field><FieldLabel htmlFor="g-marks">Marks out of {sub.lesson.maxMarks}</FieldLabel><Input id="g-marks" type="number" min={0} max={sub.lesson.maxMarks ?? 100} value={marks} onChange={(e) => setMarks(e.target.value)} /></Field>
              <Field><FieldLabel htmlFor="g-fb">Feedback (required when sending back)</FieldLabel><Textarea id="g-fb" value={feedback} onChange={(e) => setFeedback(e.target.value)} /></Field>
            </FieldGroup>
          )}
        </div>
        {!graded && <DialogFooter>
          <Button variant="outline" disabled={busy || feedback.trim().length < 3} onClick={() => send({ action: "RETURN", feedback }, "Sent back to the student")}>Send back</Button>
          <Button disabled={busy || marks === ""} onClick={() => send({ action: "GRADE", marks: Number(marks), feedback: feedback || undefined }, "Graded")}>{busy && <Spinner />}Save grade</Button>
        </DialogFooter>}
      </DialogContent>
    </Dialog>
  )
}

function AttendanceDialog({ courseId, lessonId, onClose }: { courseId: string; lessonId: string; onClose: () => void }) {
  const { data, reload } = useApi<{ enrolmentId: string; student: { name: string; enrollmentNo: string }; attended: boolean }[]>(`/api/courses/${courseId}/lessons/${lessonId}/attendance`)
  const [picked, setPicked] = React.useState<Set<string>>(new Set())
  const [busy, setBusy] = React.useState(false)
  const toggle = (k: string) => setPicked((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  async function save() {
    setBusy(true)
    try { const r = await api<{ marked: number }>(`/api/courses/${courseId}/lessons/${lessonId}/attendance`, { method: "POST", body: { enrolmentIds: [...picked] } }); toast.success(`${r.marked} marked as attended`); setPicked(new Set()); reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Attendance</DialogTitle></DialogHeader>
        {!data ? <Skeleton className="h-32" /> : (
          <div className="flex max-h-96 flex-col gap-2 overflow-y-auto text-sm">
            {data.map((r) => <label key={r.enrolmentId} className="flex items-center gap-2"><Checkbox checked={r.attended || picked.has(r.enrolmentId)} disabled={r.attended} onCheckedChange={() => toggle(r.enrolmentId)} />{r.student.name} <span className="text-xs text-muted-foreground">{r.student.enrollmentNo}</span>{r.attended && <Badge variant="secondary">Attended</Badge>}</label>)}
            {data.length === 0 && <p className="text-muted-foreground">Nobody is enrolled.</p>}
          </div>
        )}
        <DialogFooter><Button disabled={busy || picked.size === 0} onClick={save}>{busy && <Spinner />}Mark {picked.size} as attended</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type Doubt = { id: string; question: string; answer: string | null; answeredAt: string | null; createdAt: string; student: { name: string }; lesson: { title: string } | null }

/** Students' questions; answer them here. */
export function CourseQuestions({ id }: { id: string }) {
  const { data, reload } = useApi<Doubt[]>(`/api/courses/${id}/questions`)
  const [draft, setDraft] = React.useState<Record<string, string>>({})
  const [busy, setBusy] = React.useState<string | null>(null)
  if (!data) return <Skeleton className="h-32" />
  async function answer(q: Doubt) {
    setBusy(q.id)
    try { await api(`/api/courses/${id}/questions/${q.id}`, { method: "PATCH", body: { answer: draft[q.id] } }); toast.success("Answer sent"); setDraft((d) => ({ ...d, [q.id]: "" })); reload() } catch (e) { toastError(e) } finally { setBusy(null) }
  }
  return (
    <div className="flex max-w-3xl flex-col gap-3">
      {data.map((q) => (
        <Card key={q.id}>
          <CardHeader><CardTitle className="text-sm">{q.student.name} asked{q.lesson ? ` about "${q.lesson.title}"` : ""}</CardTitle><CardDescription>{fmtDateTime(q.createdAt)}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p className="whitespace-pre-wrap">{q.question}</p>
            {q.answer && <p className="whitespace-pre-wrap rounded-md bg-muted p-2"><span className="font-medium">Answer:</span> {q.answer}</p>}
            <Textarea aria-label="Your answer" placeholder={q.answer ? "Change the answer" : "Write an answer"} value={draft[q.id] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [q.id]: e.target.value }))} />
            <div><Button size="sm" disabled={busy === q.id || (draft[q.id] ?? "").trim().length < 2} onClick={() => answer(q)}>{busy === q.id && <Spinner />}{q.answer ? "Update answer" : "Answer"}</Button></div>
          </CardContent>
        </Card>
      ))}
      {data.length === 0 && <p className="text-sm text-muted-foreground">No questions yet.</p>}
    </div>
  )
}

type Analytics = {
  enrolment: { total: number; completed: number; active: number; notStarted: number; stalled: number; withdrawn: number; selfEnrolled: number }
  completionPercent: number; averageProgressPercent: number; averageQuizPercent: number | null; unansweredQuestions: number
  quizzes: { lessonId: string; title: string; students: number; averagePercent: number | null; hardestQuestions: { index: number; text: string; asked: number; wrongPercent: number }[] }[]
  assignments: { lessonId: string; title: string; submitted: number; toGrade: number; averageMarks: number | null; maxMarks: number | null }[]
  lessonCompletion: { lessonId: string; title: string; finished: number; finishedPercent: number }[]
  stalledStudents: { studentId: string; name: string; percent: number; lastActivityAt: string }[]
}

const Stat = ({ label, value }: { label: string; value: React.ReactNode }) => <Card size="sm"><CardHeader><CardDescription>{label}</CardDescription><CardTitle className="text-2xl">{value}</CardTitle></CardHeader></Card>

/** Enrolment, progress, completion, scores, learning gaps and engagement for the course. */
export function CourseAnalytics({ id }: { id: string }) {
  const { data: a } = useApi<Analytics>(`/api/courses/${id}/analytics`)
  if (!a) return <Skeleton className="h-48" />
  const e = a.enrolment
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Enrolled" value={e.total} /><Stat label="Completed" value={`${e.completed} (${a.completionPercent}%)`} />
        <Stat label="Average progress" value={`${a.averageProgressPercent}%`} /><Stat label="Quiz average" value={a.averageQuizPercent === null ? "—" : `${a.averageQuizPercent}%`} />
        <Stat label="Active now" value={e.active} /><Stat label="Not started" value={e.notStarted} /><Stat label="Stalled (14+ days idle)" value={e.stalled} /><Stat label="Unanswered questions" value={a.unansweredQuestions} />
      </div>
      <section className="flex flex-col gap-2"><h2 className="font-medium">Where students stop</h2>
        {a.lessonCompletion.map((l) => <div key={l.lessonId} className="flex items-center gap-3 text-sm"><span className="w-64 truncate">{l.title}</span><Progress value={l.finishedPercent} /><span className="w-24 text-right text-xs text-muted-foreground">{l.finished} finished</span></div>)}
      </section>
      <section className="flex flex-col gap-2"><h2 className="font-medium">Quizzes and learning gaps</h2>
        {a.quizzes.length === 0 && <p className="text-sm text-muted-foreground">No quizzes in this course.</p>}
        {a.quizzes.map((q) => (
          <Card key={q.lessonId} size="sm"><CardHeader><CardTitle>{q.title}</CardTitle><CardDescription>{q.students} student{q.students === 1 ? "" : "s"} · average {q.averagePercent === null ? "—" : `${q.averagePercent}%`}</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              {q.hardestQuestions.length === 0 ? <span className="text-muted-foreground">Not enough attempts yet to show the hardest questions.</span> : q.hardestQuestions.map((h) => <div key={h.index} className="flex justify-between gap-3"><span>{h.text}</span><span className="shrink-0 text-muted-foreground">{h.wrongPercent}% got it wrong</span></div>)}
            </CardContent></Card>
        ))}
      </section>
      <section className="flex flex-col gap-2"><h2 className="font-medium">Assignments</h2>
        {a.assignments.length === 0 && <p className="text-sm text-muted-foreground">No assignments in this course.</p>}
        {a.assignments.map((s) => <div key={s.lessonId} className="flex justify-between text-sm"><span>{s.title}</span><span className="text-muted-foreground">{s.submitted} handed in · {s.toGrade} to grade{s.averageMarks !== null && ` · average ${s.averageMarks}/${s.maxMarks}`}</span></div>)}
      </section>
      {a.stalledStudents.length > 0 && <section className="flex flex-col gap-2"><h2 className="font-medium">Students who have gone quiet</h2>
        {a.stalledStudents.map((s) => <div key={s.studentId} className="flex justify-between text-sm"><span>{s.name}</span><span className="text-muted-foreground">{s.percent}% done · last active {fmtDate(s.lastActivityAt)}</span></div>)}
      </section>}
    </div>
  )
}
