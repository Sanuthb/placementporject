"use client"

/* eslint-disable @next/next/no-img-element -- lesson images are short-lived signed URLs, so next/image cannot optimise them */

import * as React from "react"
import Link from "next/link"
import { CheckCircle2Icon, CircleIcon } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, fmtDateTime, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Lesson = {
  id: string; title: string; type: string; required: boolean; body?: string | null; done?: boolean; durationMin?: number | null; url?: string | null
  file?: { name: string | null; mimeType: string | null; sizeBytes: number | null; viewUrl: string | null; downloadUrl: string | null } | null
  startsAt?: string | null; dueAt?: string | null; maxMarks?: number | null
  submission?: { status: string; text: string | null; fileName: string | null; fileUrl: string | null; marks: number | null; feedback: string | null; submittedAt: string; late: boolean } | null
  passPercent?: number | null; maxAttempts?: number | null; attemptsLeft?: number | null; questions?: { text: string; options: string[] }[]
  attempts?: { attemptNumber: number; percent: number; passed: boolean; createdAt: string }[]; passed?: boolean; bestPercent?: number | null
}
type Detail = {
  id: string; title: string; summary: string | null; description: string | null; category: string | null; level: string | null; skills: string[]; status: string; certificateEnabled: boolean; selfEnrol: boolean
  enrolled: boolean; completedAt?: string | null; progress?: { done: number; total: number; percent: number; complete: boolean }; nextLessonId?: string | null; certificate?: { serial: string } | null
  questions?: { id: string; lessonId: string | null; question: string; answer: string | null; createdAt: string }[]
  modules: { id: string; title: string; lessons: Lesson[] }[]
}
type Review = { attemptNumber: number; percent: number; passed: boolean; attemptsLeft: number | null; review: { correct: boolean; correctOption?: number; explanation?: string | null }[]; courseCompleted: boolean }

/** A student's view of one course: the outline before joining, then the lessons, quizzes, assignments, questions and certificate. */
export function CoursePlayer({ id }: { id: string }) {
  const { data, reload } = useApi<Detail>(`/api/student/courses/${id}`)
  const [pick, setPick] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  if (!data) return <Skeleton className="h-64" />
  const lessons = data.modules.flatMap((m) => m.lessons)

  async function act(f: () => Promise<unknown>, ok?: string) {
    setBusy(true)
    try { await f(); if (ok) toast.success(ok); reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }

  if (!data.enrolled) return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div><h1 className="text-xl font-semibold">{data.title}</h1><p className="text-sm text-muted-foreground">{[data.category, data.level && titleCase(data.level)].filter(Boolean).join(" · ")}</p></div>
      {data.description || data.summary ? <p className="whitespace-pre-wrap text-sm">{data.description ?? data.summary}</p> : null}
      <Card><CardHeader><CardTitle>What is in it</CardTitle></CardHeader><CardContent className="flex flex-col gap-3 text-sm">
        {data.modules.map((m) => <div key={m.id}><div className="font-medium">{m.title}</div><ul className="ml-4 list-disc text-muted-foreground">{m.lessons.map((l) => <li key={l.id}>{l.title} <Badge variant="outline">{titleCase(l.type)}</Badge></li>)}</ul></div>)}
      </CardContent></Card>
      {data.status === "PUBLISHED" && (data.selfEnrol
        ? <div><Button disabled={busy} onClick={() => act(() => api(`/api/student/courses/${id}/enrol`, { method: "POST" }), "You joined the course")}>{busy && <Spinner />}Join this course</Button></div>
        : <Alert><AlertDescription>Your placement office enrols students in this course. Ask them to add you.</AlertDescription></Alert>)}
    </div>
  )

  const current = lessons.find((l) => l.id === (pick ?? data.nextLessonId)) ?? lessons[0]
  const p = data.progress!
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-xl font-semibold">{data.title}</h1><p className="text-sm text-muted-foreground">{p.done} of {p.total} required lessons done</p></div>
        <div className="flex items-center gap-3"><div className="w-40"><Progress value={p.percent} /></div>{data.certificate && <Button size="sm" render={<Link href={`/student/courses/${id}/certificate`} />}>View certificate</Button>}</div>
      </div>
      {data.completedAt && <Alert><AlertTitle>You completed this course</AlertTitle><AlertDescription>Finished on {fmtDate(data.completedAt)}.{data.certificate ? " Your certificate is ready." : ""}</AlertDescription></Alert>}

      <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
        <nav aria-label="Lessons" className="flex flex-col gap-3 text-sm">
          {data.modules.map((m) => (
            <div key={m.id}><div className="mb-1 font-medium">{m.title}</div>
              {m.lessons.map((l) => <button key={l.id} type="button" onClick={() => setPick(l.id)} className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted ${current?.id === l.id ? "bg-muted font-medium" : ""}`}>{l.done ? <CheckCircle2Icon className="size-4 shrink-0 text-primary" /> : <CircleIcon className="size-4 shrink-0 text-muted-foreground" />}<span className="flex-1">{l.title}</span>{!l.required && <span className="text-xs text-muted-foreground">optional</span>}</button>)}
            </div>
          ))}
        </nav>
        <div className="flex flex-col gap-4">
          {current && <LessonView key={current.id} courseId={id} lesson={current} busy={busy} act={act} onNext={() => { const i = lessons.findIndex((l) => l.id === current.id); if (lessons[i + 1]) setPick(lessons[i + 1].id) }} />}
          <Tutor courseId={id} lessonId={current?.id} />
          <Ask courseId={id} lessonId={current?.id} questions={data.questions ?? []} onSent={reload} />
        </div>
      </div>
    </div>
  )
}

function LessonView({ courseId, lesson: l, busy, act, onNext }: { courseId: string; lesson: Lesson; busy: boolean; act: (f: () => Promise<unknown>, ok?: string) => Promise<void>; onNext: () => void }) {
  const base = `/api/student/courses/${courseId}/lessons/${l.id}`
  const markDone = () => act(async () => { await api(`${base}/complete`, { method: "POST" }) }, "Lesson done")
  const manual = ["VIDEO", "DOCUMENT", "LINK", "TEXT"].includes(l.type)
  return (
    <Card>
      <CardHeader><CardTitle>{l.title}</CardTitle><CardDescription>{titleCase(l.type)}{l.durationMin ? ` · ${l.durationMin} min` : ""}{l.done && " · done"}</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {l.type === "VIDEO" && l.file?.viewUrl && <video controls className="w-full rounded-md" src={l.file.viewUrl} />}
        {(l.type === "VIDEO" || l.type === "DOCUMENT" || l.type === "LINK") && l.url && <div><Button variant="outline" render={<a href={l.url} target="_blank" rel="noreferrer" />}>{l.type === "VIDEO" ? "Watch the video" : "Open the link"}</Button></div>}
        {l.type === "DOCUMENT" && l.file?.viewUrl && (l.file.mimeType?.startsWith("image/") ? <img alt={l.file.name ?? l.title} className="max-w-full rounded-md" src={l.file.viewUrl} /> : <div><Button variant="outline" render={<a href={l.file.viewUrl} target="_blank" rel="noreferrer" />}>Open {l.file.name}</Button></div>)}
        {l.file?.downloadUrl && <div><Button variant="outline" size="sm" render={<a href={l.file.downloadUrl} />}>Download {l.file.name}</Button></div>}
        {l.body && <p className="whitespace-pre-wrap">{l.body}</p>}

        {l.type === "LIVE" && <div className="flex flex-col gap-2"><p>Starts {fmtDateTime(l.startsAt)}.</p>{l.url ? <Button render={<a href={l.url} target="_blank" rel="noreferrer" />}>Join the session</Button> : <p className="text-muted-foreground">The meeting link appears 15 minutes before the session starts.</p>}<p className="text-muted-foreground">Your teacher marks attendance after the session; that finishes this lesson.</p></div>}
        {l.type === "ASSIGNMENT" && <Assignment lesson={l} base={base} busy={busy} act={act} />}
        {l.type === "QUIZ" && <Quiz lesson={l} base={base} reload={() => act(async () => undefined)} />}

        <div className="flex gap-2">
          {manual && !l.done && <Button disabled={busy} onClick={markDone}>{busy && <Spinner />}Mark as done</Button>}
          <Button variant="outline" onClick={onNext}>Next lesson</Button>
        </div>
      </CardContent>
    </Card>
  )
}

function Assignment({ lesson: l, base, busy, act }: { lesson: Lesson; base: string; busy: boolean; act: (f: () => Promise<unknown>, ok?: string) => Promise<void> }) {
  const s = l.submission
  const [text, setText] = React.useState(s?.text ?? "")
  const [file, setFile] = React.useState<File | null>(null)
  const locked = s?.status === "GRADED"
  function send(e: React.FormEvent) {
    e.preventDefault()
    const fd = new FormData(); fd.set("text", text); if (file) fd.set("file", file)
    void act(async () => { const r = await api<{ late: boolean }>(`${base}/submission`, { method: "POST", body: fd }); if (r.late) toast.message("Handed in after the due date; your teacher will see it as late") }, "Handed in")
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground">{l.maxMarks} marks{l.dueAt ? ` · due ${fmtDateTime(l.dueAt)}` : ""}</p>
      {s && <Alert><AlertTitle>{s.status === "GRADED" ? `Graded: ${s.marks}/${l.maxMarks}` : s.status === "RETURNED" ? "Sent back to you" : "Handed in, waiting to be graded"}{s.late && " (late)"}</AlertTitle><AlertDescription>{s.feedback ?? `Handed in ${fmtDateTime(s.submittedAt)}`}{s.fileUrl && <> · <a className="underline underline-offset-4" href={s.fileUrl} target="_blank" rel="noreferrer">{s.fileName}</a></>}</AlertDescription></Alert>}
      {!locked && (
        <form onSubmit={send} className="flex flex-col gap-3">
          <Field><FieldLabel htmlFor={`a-${l.id}`}>Your answer</FieldLabel><Textarea id={`a-${l.id}`} className="min-h-28" value={text} onChange={(e) => setText(e.target.value)} /></Field>
          <Field><FieldLabel htmlFor={`f-${l.id}`}>Attach a file (PDF, PNG or JPEG, up to 10 MB)</FieldLabel><Input id={`f-${l.id}`} type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
          <div><Button type="submit" disabled={busy || (!text.trim() && !file && !s?.fileName)}>{busy && <Spinner />}{s ? "Hand in again" : "Hand in"}</Button></div>
        </form>
      )}
    </div>
  )
}

function Quiz({ lesson: l, base, reload }: { lesson: Lesson; base: string; reload: () => void }) {
  const qs = l.questions ?? []
  const [answers, setAnswers] = React.useState<(number | null)[]>(() => qs.map(() => null))
  const [res, setRes] = React.useState<Review | null>(null)
  const [busy, setBusy] = React.useState(false)
  async function submit() {
    setBusy(true)
    try { const r = await api<Review>(`${base}/quiz`, { method: "POST", body: { answers } }); setRes(r); if (r.passed) toast.success("You passed"); reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  const retry = () => { setRes(null); setAnswers(qs.map(() => null)) }
  const exhausted = l.attemptsLeft === 0 && !l.passed
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground">Pass mark {l.passPercent}%{l.maxAttempts ? ` · ${l.attemptsLeft} of ${l.maxAttempts} attempts left` : " · as many attempts as you like"}{l.bestPercent != null && ` · best ${l.bestPercent}%`}</p>
      {res && (
        <Alert><AlertTitle>{res.passed ? `Passed with ${res.percent}%` : `You scored ${res.percent}%`}</AlertTitle>
          <AlertDescription>{res.courseCompleted ? "That completes the course." : res.passed ? "This lesson is done." : res.attemptsLeft === 0 ? "No attempts left." : "Have another go; the questions you got wrong are marked below."}</AlertDescription></Alert>
      )}
      {l.passed && !res && <Alert><AlertTitle>You passed this quiz</AlertTitle></Alert>}
      {!l.passed && !exhausted && qs.map((q, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-md border p-3">
          <div className="font-medium">{i + 1}. {q.text} {res && <Badge variant={res.review[i].correct ? "default" : "destructive"}>{res.review[i].correct ? "Right" : "Wrong"}</Badge>}</div>
          <RadioGroup value={answers[i] === null || answers[i] === undefined ? "" : String(answers[i])} onValueChange={(v) => { setRes(null); setAnswers((a) => a.map((x, j) => (j === i ? Number(v) : x))) }}>
            {q.options.map((o, k) => <label key={k} className="flex items-center gap-2"><RadioGroupItem value={String(k)} />{o}</label>)}
          </RadioGroup>
        </div>
      ))}
      {res?.review.some((r) => r.explanation) && <ul className="list-disc pl-5 text-muted-foreground">{res.review.map((r, i) => r.explanation ? <li key={i}>Question {i + 1}: {r.explanation}</li> : null)}</ul>}
      {!l.passed && !exhausted && <div className="flex gap-2"><Button disabled={busy || answers.every((a) => a === null)} onClick={submit}>{busy && <Spinner />}Submit answers</Button>{res && !res.passed && res.attemptsLeft !== 0 && <Button variant="outline" onClick={retry}>Clear and retry</Button>}</div>}
      {exhausted && <p className="text-muted-foreground">You have used all your attempts. Ask your teacher if you need another.</p>}
    </div>
  )
}

function Tutor({ courseId, lessonId }: { courseId: string; lessonId?: string }) {
  const [text, setText] = React.useState("")
  const [turns, setTurns] = React.useState<{ q: string; a: string }[]>([])
  const [busy, setBusy] = React.useState(false)
  async function send(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    try {
      const r = await api<{ answer: string }>(`/api/student/courses/${courseId}/tutor`, { method: "POST", body: { question: text, lessonId, history: turns.slice(-4) } })
      setTurns((t) => [...t, { q: text, a: r.answer }]); setText("")
    } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  return (
    <Card size="sm">
      <CardHeader><CardTitle>AI tutor</CardTitle><CardDescription>Ask for an explanation or an example. It helps you understand; it will not give quiz answers or do your assignment. It can make mistakes, so check anything important with your teacher.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {turns.map((t, i) => <div key={i} className="flex flex-col gap-1"><p className="font-medium">{t.q}</p><p className="whitespace-pre-wrap rounded-md bg-muted p-2">{t.a}</p></div>)}
        <form onSubmit={send} className="flex flex-col gap-2"><Textarea aria-label="Ask the tutor" minLength={3} value={text} onChange={(e) => setText(e.target.value)} /><div><Button type="submit" size="sm" disabled={busy || text.trim().length < 3}>{busy && <Spinner />}Ask the tutor</Button></div></form>
      </CardContent>
    </Card>
  )
}

function Ask({ courseId, lessonId, questions, onSent }: { courseId: string; lessonId?: string; questions: NonNullable<Detail["questions"]>; onSent: () => void }) {
  const [text, setText] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  async function send(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    try { await api(`/api/student/courses/${courseId}/questions`, { method: "POST", body: { question: text, lessonId } }); toast.success("Question sent to your teachers"); setText(""); onSent() } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  return (
    <Card size="sm">
      <CardHeader><CardTitle>Ask a question</CardTitle><CardDescription>About this lesson or the course. Your teachers will answer here.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <form onSubmit={send} className="flex flex-col gap-2"><Textarea aria-label="Your question" minLength={5} value={text} onChange={(e) => setText(e.target.value)} /><div><Button type="submit" size="sm" disabled={busy || text.trim().length < 5}>{busy && <Spinner />}Send question</Button></div></form>
        {questions.map((q) => <div key={q.id} className="rounded-md border p-2"><p className="whitespace-pre-wrap">{q.question}</p>{q.answer ? <p className="mt-1 whitespace-pre-wrap rounded bg-muted p-2"><span className="font-medium">Answer:</span> {q.answer}</p> : <p className="mt-1 text-xs text-muted-foreground">Waiting for an answer</p>}</div>)}
      </CardContent>
    </Card>
  )
}
