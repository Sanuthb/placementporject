"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowDownIcon, ArrowUpIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { CourseAnalytics, CourseGrading, CourseQuestions, CourseStudents } from "@/components/course-people"
import { OptionSelect } from "@/components/option-select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { fmtDateTime, titleCase } from "@/lib/web/format"
import { useLookups } from "@/lib/web/lookups"
import { useApi } from "@/lib/web/use-api"

type Q = { text: string; options: string[]; correct: number; explanation?: string }
export type Lesson = {
  id: string; type: string; title: string; body: string | null; url: string | null; hasFile: boolean; fileUrl: string | null; fileName: string | null; mimeType: string | null
  downloadable: boolean; required: boolean; maxMarks: number | null; dueAt: string | null; startsAt: string | null; durationMin: number | null; passPercent: number | null; maxAttempts: number | null; questions: Q[] | null
}
type Module = { id: string; title: string; lessons: Lesson[] }
type Course = { id: string; title: string; summary: string | null; description: string | null; category: string | null; level: string | null; skills: string[]; departmentId: string | null; batchId: string | null; status: string; certificateEnabled: boolean; selfEnrol: boolean }
type Data = { course: Course; modules: Module[]; publishProblems: string[]; enrolled: number }

const TYPES = ["VIDEO", "DOCUMENT", "LINK", "TEXT", "ASSIGNMENT", "QUIZ", "LIVE"].map((t) => ({ value: t, label: titleCase(t) }))
const LEVELS = [{ value: "BEGINNER", label: "Beginner" }, { value: "INTERMEDIATE", label: "Intermediate" }, { value: "ADVANCED", label: "Advanced" }]
const local = (d: string | null) => (d ? new Date(new Date(d).getTime() - new Date(d).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "")
const blankQ = (): Q => ({ text: "", options: ["", ""], correct: 0 })

/** The staff view of one course: build its content, publish it, then follow the students, grading, questions and results. */
export function CourseBuilder({ id }: { id: string }) {
  const { data, reload, loading } = useApi<Data>(`/api/courses/${id}`)
  const [lesson, setLesson] = React.useState<{ moduleId: string; lesson?: Lesson } | null>(null)
  const [newModule, setNewModule] = React.useState("")
  const [busy, setBusy] = React.useState<string | null>(null)
  const [ask, setAsk] = React.useState<{ title: string; run: () => void } | null>(null)
  const [rename, setRename] = React.useState<{ id: string; title: string } | null>(null)

  if (!data) return loading ? <Skeleton className="h-64" /> : null
  const { course, modules } = data
  async function call(key: string, f: () => Promise<unknown>, ok?: string) {
    setBusy(key)
    try { await f(); if (ok) toast.success(ok); reload() } catch (e) { toastError(e) } finally { setBusy(null) }
  }
  const setStatus = (status: string, ok: string) => call("status", () => api(`/api/courses/${id}/status`, { method: "POST", body: { status } }), ok)
  const draft = course.status === "DRAFT"

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><h1 className="text-xl font-semibold">{course.title}</h1><Badge variant={course.status === "PUBLISHED" ? "default" : "outline"}>{titleCase(course.status)}</Badge></div>
          <p className="text-sm text-muted-foreground">{data.enrolled} student{data.enrolled === 1 ? "" : "s"} · {modules.reduce((n, m) => n + m.lessons.length, 0)} lessons</p>
        </div>
        <div className="flex gap-2">
          {draft && <Button disabled={busy === "status"} onClick={() => setStatus("PUBLISHED", "Course published")}>{busy === "status" && <Spinner />}Publish</Button>}
          {course.status === "PUBLISHED" && <Button variant="outline" disabled={busy === "status"} onClick={() => setStatus("ARCHIVED", "Course archived. Enrolled students keep their access")}>Archive</Button>}
          {course.status === "PUBLISHED" && data.enrolled === 0 && <Button variant="outline" onClick={() => setStatus("DRAFT", "Back to draft")}>Back to draft</Button>}
          {course.status === "ARCHIVED" && <Button variant="outline" onClick={() => setStatus("PUBLISHED", "Course published again")}>Publish again</Button>}
        </div>
      </div>
      {draft && data.publishProblems.length > 0 && (
        <Alert><AlertTitle>Before you can publish</AlertTitle><AlertDescription><ul className="list-disc pl-5">{data.publishProblems.map((p) => <li key={p}>{p}</li>)}</ul></AlertDescription></Alert>
      )}

      <Tabs defaultValue="content">
        <TabsList><TabsTrigger value="content">Content</TabsTrigger><TabsTrigger value="students">Students</TabsTrigger><TabsTrigger value="grading">Assignments and live</TabsTrigger><TabsTrigger value="questions">Questions</TabsTrigger><TabsTrigger value="analytics">Analytics</TabsTrigger><TabsTrigger value="settings">Settings</TabsTrigger></TabsList>

        <TabsContent value="content" className="flex flex-col gap-3">
          {modules.map((m, mi) => (
            <Card key={m.id}>
              <CardHeader className="flex-row items-center justify-between gap-2">
                <CardTitle>{m.title}</CardTitle>
                <div className="flex gap-1">
                  <Button size="icon-sm" variant="ghost" aria-label="Move module up" disabled={mi === 0} onClick={() => call(`m${m.id}`, () => api(`/api/courses/${id}/modules/${m.id}`, { method: "PATCH", body: { move: "up" } }))}><ArrowUpIcon /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Move module down" disabled={mi === modules.length - 1} onClick={() => call(`m${m.id}`, () => api(`/api/courses/${id}/modules/${m.id}`, { method: "PATCH", body: { move: "down" } }))}><ArrowDownIcon /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Rename module" onClick={() => setRename({ id: m.id, title: m.title })}><PencilIcon /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Delete module" onClick={() => setAsk({ title: `Delete the module "${m.title}" and its lessons?`, run: () => void call(`m${m.id}`, () => api(`/api/courses/${id}/modules/${m.id}`, { method: "DELETE" }), "Module deleted") })}><Trash2Icon /></Button>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                {m.lessons.map((l, li) => (
                  <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
                    <div className="flex items-center gap-2"><Badge variant="outline">{titleCase(l.type)}</Badge><span className="font-medium">{l.title}</span>{!l.required && <Badge variant="secondary">Optional</Badge>}
                      <span className="text-xs text-muted-foreground">{l.type === "QUIZ" ? `${l.questions?.length ?? 0} questions` : l.type === "LIVE" ? fmtDateTime(l.startsAt) : l.type === "ASSIGNMENT" ? `${l.maxMarks} marks` : l.hasFile ? l.fileName : ""}</span></div>
                    <div className="flex gap-1">
                      <Button size="icon-sm" variant="ghost" aria-label="Move lesson up" disabled={li === 0} onClick={() => call(`l${l.id}`, () => api(`/api/courses/${id}/lessons/${l.id}`, { method: "PATCH", body: { move: "up" } }))}><ArrowUpIcon /></Button>
                      <Button size="icon-sm" variant="ghost" aria-label="Move lesson down" disabled={li === m.lessons.length - 1} onClick={() => call(`l${l.id}`, () => api(`/api/courses/${id}/lessons/${l.id}`, { method: "PATCH", body: { move: "down" } }))}><ArrowDownIcon /></Button>
                      <Button size="icon-sm" variant="ghost" aria-label="Edit lesson" onClick={() => setLesson({ moduleId: m.id, lesson: l })}><PencilIcon /></Button>
                      <Button size="icon-sm" variant="ghost" aria-label="Delete lesson" onClick={() => setAsk({ title: `Delete the lesson "${l.title}"?`, run: () => void call(`l${l.id}`, () => api(`/api/courses/${id}/lessons/${l.id}`, { method: "DELETE" }), "Lesson deleted") })}><Trash2Icon /></Button>
                    </div>
                  </div>
                ))}
                {m.lessons.length === 0 && <p className="text-muted-foreground">No lessons in this module yet.</p>}
                <div><Button size="sm" variant="outline" onClick={() => setLesson({ moduleId: m.id })}><PlusIcon />Add lesson</Button></div>
              </CardContent>
            </Card>
          ))}
          <form className="flex max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); if (newModule.trim().length > 1) void call("module", () => api(`/api/courses/${id}/modules`, { method: "POST", body: { title: newModule.trim() } }).then(() => setNewModule(""))) }}>
            <Input aria-label="New module name" placeholder="New module, for example Week 1: Basics" value={newModule} onChange={(e) => setNewModule(e.target.value)} />
            <Button type="submit" variant="outline" disabled={busy === "module"}><PlusIcon />Add module</Button>
          </form>
        </TabsContent>

        <TabsContent value="students"><CourseStudents id={id} published={course.status === "PUBLISHED"} /></TabsContent>
        <TabsContent value="grading"><CourseGrading id={id} modules={modules} /></TabsContent>
        <TabsContent value="questions"><CourseQuestions id={id} /></TabsContent>
        <TabsContent value="analytics"><CourseAnalytics id={id} /></TabsContent>
        <TabsContent value="settings"><CourseSettings course={course} canDelete={draft && data.enrolled === 0} onSaved={reload} /></TabsContent>
      </Tabs>

      <AlertDialog open={!!ask} onOpenChange={(o) => !o && setAsk(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{ask?.title}</AlertDialogTitle><AlertDialogDescription>This cannot be undone. Anything students have done in it blocks the deletion.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep it</AlertDialogCancel><AlertDialogAction onClick={() => { ask?.run(); setAsk(null) }}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={!!rename} onOpenChange={(o) => !o && setRename(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename module</DialogTitle></DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (rename && rename.title.trim().length > 1) { const r = rename; setRename(null); void call(`m${r.id}`, () => api(`/api/courses/${id}/modules/${r.id}`, { method: "PATCH", body: { title: r.title.trim() } })) } }}>
            <Input aria-label="Module name" value={rename?.title ?? ""} onChange={(e) => setRename((r) => (r ? { ...r, title: e.target.value } : r))} />
            <DialogFooter><Button type="submit">Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {lesson && <LessonDialog courseId={id} target={lesson} onClose={() => setLesson(null)} onSaved={() => { setLesson(null); reload() }} />}
    </div>
  )
}

function CourseSettings({ course, canDelete, onSaved }: { course: Course; canDelete: boolean; onSaved: () => void }) {
  const lk = useLookups()
  const router = useRouter()
  const [v, setV] = React.useState({ title: course.title, summary: course.summary ?? "", description: course.description ?? "", category: course.category ?? "", level: course.level ?? "", skills: course.skills.join(", "), departmentId: course.departmentId ?? "", batchId: course.batchId ?? "", certificateEnabled: course.certificateEnabled, selfEnrol: course.selfEnrol })
  const [busy, setBusy] = React.useState(false)
  const set = <K extends keyof typeof v>(k: K) => (x: (typeof v)[K]) => setV((o) => ({ ...o, [k]: x }))
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    try {
      await api(`/api/courses/${course.id}`, { method: "PATCH", body: { title: v.title, summary: v.summary || null, description: v.description || null, category: v.category || null, level: v.level || null, skills: v.skills.split(",").map((s) => s.trim()).filter(Boolean), departmentId: v.departmentId || null, batchId: v.batchId || null, certificateEnabled: v.certificateEnabled, selfEnrol: v.selfEnrol } })
      toast.success("Course saved"); onSaved()
    } catch (err) { toastError(err) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={save} className="flex max-w-xl flex-col gap-4">
      <FieldGroup>
        <Field><FieldLabel htmlFor="s-title">Title</FieldLabel><Input id="s-title" required minLength={3} value={v.title} onChange={(e) => set("title")(e.target.value)} /></Field>
        <Field><FieldLabel htmlFor="s-sum">Short description</FieldLabel><Textarea id="s-sum" maxLength={500} value={v.summary} onChange={(e) => set("summary")(e.target.value)} /></Field>
        <Field><FieldLabel htmlFor="s-desc">About this course</FieldLabel><Textarea id="s-desc" className="min-h-32" value={v.description} onChange={(e) => set("description")(e.target.value)} /></Field>
        <Field><FieldLabel htmlFor="s-cat">Category</FieldLabel><Input id="s-cat" value={v.category} onChange={(e) => set("category")(e.target.value)} /></Field>
        <Field><FieldLabel>Level</FieldLabel><OptionSelect className="w-full" value={v.level} onChange={set("level")} options={LEVELS} placeholder="Choose level" /></Field>
        <Field><FieldLabel htmlFor="s-skills">Skills it teaches, separated by commas</FieldLabel><Input id="s-skills" value={v.skills} onChange={(e) => set("skills")(e.target.value)} /></Field>
        <Field><FieldLabel>Only for one department</FieldLabel><OptionSelect className="w-full" value={v.departmentId} onChange={set("departmentId")} options={[{ value: "", label: "Every department" }, ...lk.departments]} placeholder="Every department" /></Field>
        <Field><FieldLabel>Only for one batch</FieldLabel><OptionSelect className="w-full" value={v.batchId} onChange={set("batchId")} options={[{ value: "", label: "Every batch" }, ...lk.batches]} placeholder="Every batch" /></Field>
        <label className="flex items-center gap-2 text-sm"><Switch checked={v.selfEnrol} onCheckedChange={set("selfEnrol")} />Students can join on their own</label>
        <label className="flex items-center gap-2 text-sm"><Switch checked={v.certificateEnabled} onCheckedChange={set("certificateEnabled")} />Give a certificate when a student finishes</label>
      </FieldGroup>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>{busy && <Spinner />}Save</Button>
        {canDelete && <Button type="button" variant="destructive" onClick={async () => { try { await api(`/api/courses/${course.id}`, { method: "DELETE" }); router.push("/staff/courses") } catch (e) { toastError(e) } }}>Delete this draft</Button>}
      </div>
    </form>
  )
}

function LessonDialog({ courseId, target, onClose, onSaved }: { courseId: string; target: { moduleId: string; lesson?: Lesson }; onClose: () => void; onSaved: () => void }) {
  const old = target.lesson
  const [type, setType] = React.useState(old?.type ?? "TEXT")
  const [v, setV] = React.useState({ title: old?.title ?? "", body: old?.body ?? "", url: old?.url ?? "", downloadable: old?.downloadable ?? false, required: old?.required ?? true, maxMarks: String(old?.maxMarks ?? 10), dueAt: local(old?.dueAt ?? null), startsAt: local(old?.startsAt ?? null), durationMin: String(old?.durationMin ?? 60), passPercent: String(old?.passPercent ?? 60), maxAttempts: String(old?.maxAttempts ?? "") })
  const [qs, setQs] = React.useState<Q[]>(old?.questions?.length ? old.questions : [blankQ()])
  const [file, setFile] = React.useState<File | null>(null)
  const [busy, setBusy] = React.useState(false)
  const set = <K extends keyof typeof v>(k: K) => (x: (typeof v)[K]) => setV((o) => ({ ...o, [k]: x }))
  const upd = (i: number, f: (q: Q) => Q) => setQs((a) => a.map((q, j) => (j === i ? f(q) : q)))

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    try {
      const num = (s: string) => (s.trim() === "" ? null : Number(s))
      const fields: Record<string, unknown> = { title: v.title, required: v.required }
      if (["VIDEO", "DOCUMENT", "LINK", "LIVE"].includes(type)) fields.url = v.url.trim() || null
      if (["VIDEO", "DOCUMENT"].includes(type)) fields.downloadable = v.downloadable
      if (type !== "QUIZ" || v.body) fields.body = v.body.trim() || null
      if (type === "ASSIGNMENT") { fields.maxMarks = num(v.maxMarks); fields.dueAt = v.dueAt ? new Date(v.dueAt).toISOString() : null }
      if (type === "LIVE") { fields.startsAt = v.startsAt ? new Date(v.startsAt).toISOString() : null; fields.durationMin = num(v.durationMin) }
      if (type === "QUIZ") {
        fields.passPercent = num(v.passPercent); fields.maxAttempts = num(v.maxAttempts)
        const clean = qs.map((q) => ({ ...q, options: q.options.map((o) => o.trim()).filter(Boolean), explanation: q.explanation?.trim() || undefined }))
        if (!old || JSON.stringify(clean) !== JSON.stringify(old.questions ?? [])) fields.questions = clean
      }
      const saved = old ? await api<unknown>(`/api/courses/${courseId}/lessons/${old.id}`, { method: "PATCH", body: fields }).then(() => ({ id: old.id })) : await api<{ id: string }>(`/api/courses/${courseId}/lessons`, { method: "POST", body: { ...fields, type, moduleId: target.moduleId } })
      if (file) { const fd = new FormData(); fd.set("file", file); await api(`/api/courses/${courseId}/lessons/${saved.id}/file`, { method: "POST", body: fd }) }
      toast.success("Lesson saved"); onSaved()
    } catch (err) { toastError(err) } finally { setBusy(false) }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{old ? "Edit lesson" : "Add lesson"}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-4">
          <FieldGroup>
            {!old && <Field><FieldLabel>Kind of lesson</FieldLabel><OptionSelect className="w-full" value={type} onChange={setType} options={TYPES} placeholder="Choose" /></Field>}
            <Field><FieldLabel htmlFor="l-title">Title</FieldLabel><Input id="l-title" required minLength={2} value={v.title} onChange={(e) => set("title")(e.target.value)} /></Field>

            {(type === "VIDEO" || type === "DOCUMENT") && <>
              <Field><FieldLabel htmlFor="l-url">{type === "VIDEO" ? "Video link (YouTube, Vimeo...)" : "Document link"}, or upload below</FieldLabel><Input id="l-url" type="url" value={v.url} onChange={(e) => set("url")(e.target.value)} /></Field>
              <Field><FieldLabel htmlFor="l-file">{type === "VIDEO" ? "Upload a video (MP4 or WebM, up to 50 MB)" : "Upload a document (PDF, PNG or JPEG, up to 10 MB)"}</FieldLabel><Input id="l-file" type="file" accept={type === "VIDEO" ? "video/mp4,video/webm" : "application/pdf,image/png,image/jpeg"} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />{old?.hasFile && !file && <p className="text-xs text-muted-foreground">Current file: {old.fileName}. Choosing another replaces it.</p>}</Field>
              <label className="flex items-center gap-2 text-sm"><Switch checked={v.downloadable} onCheckedChange={set("downloadable")} />Students may download the file</label>
            </>}
            {type === "LINK" && <Field><FieldLabel htmlFor="l-url">Link</FieldLabel><Input id="l-url" type="url" required value={v.url} onChange={(e) => set("url")(e.target.value)} /></Field>}
            {type === "LIVE" && <>
              <Field><FieldLabel htmlFor="l-start">Starts</FieldLabel><Input id="l-start" type="datetime-local" required value={v.startsAt} onChange={(e) => set("startsAt")(e.target.value)} /></Field>
              <Field><FieldLabel htmlFor="l-dur">Length in minutes</FieldLabel><Input id="l-dur" type="number" min={5} max={600} value={v.durationMin} onChange={(e) => set("durationMin")(e.target.value)} /></Field>
              <Field><FieldLabel htmlFor="l-url">Meeting link (shown to students 15 minutes before it starts)</FieldLabel><Input id="l-url" type="url" required value={v.url} onChange={(e) => set("url")(e.target.value)} /></Field>
            </>}
            {type === "ASSIGNMENT" && <>
              <Field><FieldLabel htmlFor="l-marks">Maximum marks</FieldLabel><Input id="l-marks" type="number" min={1} max={1000} value={v.maxMarks} onChange={(e) => set("maxMarks")(e.target.value)} /></Field>
              <Field><FieldLabel htmlFor="l-due">Due (optional; late work is still accepted and marked late)</FieldLabel><Input id="l-due" type="datetime-local" value={v.dueAt} onChange={(e) => set("dueAt")(e.target.value)} /></Field>
            </>}
            <Field><FieldLabel htmlFor="l-body">{type === "TEXT" ? "Lesson text" : type === "ASSIGNMENT" ? "Instructions" : "Notes for students (optional)"}</FieldLabel><Textarea id="l-body" className="min-h-24" required={type === "TEXT" || type === "ASSIGNMENT"} value={v.body} onChange={(e) => set("body")(e.target.value)} /></Field>

            {type === "QUIZ" && <>
              <div className="grid grid-cols-2 gap-3">
                <Field><FieldLabel htmlFor="l-pass">Pass mark (%)</FieldLabel><Input id="l-pass" type="number" min={1} max={100} required value={v.passPercent} onChange={(e) => set("passPercent")(e.target.value)} /></Field>
                <Field><FieldLabel htmlFor="l-att">Attempts allowed (empty = no limit)</FieldLabel><Input id="l-att" type="number" min={1} max={20} value={v.maxAttempts} onChange={(e) => set("maxAttempts")(e.target.value)} /></Field>
              </div>
              {qs.map((q, i) => (
                <Card key={i}><CardContent className="flex flex-col gap-2 pt-4">
                  <div className="flex gap-2"><Input aria-label={`Question ${i + 1}`} placeholder={`Question ${i + 1}`} value={q.text} onChange={(e) => upd(i, (x) => ({ ...x, text: e.target.value }))} /><Button type="button" size="icon-sm" variant="ghost" aria-label="Remove question" disabled={qs.length === 1} onClick={() => setQs((a) => a.filter((_, j) => j !== i))}><Trash2Icon /></Button></div>
                  <RadioGroup value={String(q.correct)} onValueChange={(c) => upd(i, (x) => ({ ...x, correct: Number(c) }))}>
                    {q.options.map((o, k) => <div key={k} className="flex items-center gap-2"><RadioGroupItem value={String(k)} aria-label={`Option ${k + 1} is correct`} /><Input aria-label={`Option ${k + 1}`} placeholder={`Option ${k + 1}${q.correct === k ? " (correct)" : ""}`} value={o} onChange={(e) => upd(i, (x) => ({ ...x, options: x.options.map((y, m) => (m === k ? e.target.value : y)) }))} /></div>)}
                  </RadioGroup>
                  <div className="flex gap-2">{q.options.length < 6 && <Button type="button" size="sm" variant="outline" onClick={() => upd(i, (x) => ({ ...x, options: [...x.options, ""] }))}>Add option</Button>}{q.options.length > 2 && <Button type="button" size="sm" variant="outline" onClick={() => upd(i, (x) => ({ ...x, options: x.options.slice(0, -1), correct: Math.min(x.correct, x.options.length - 2) }))}>Remove last option</Button>}</div>
                  <Input aria-label="Explanation" placeholder="Why this is the answer (shown after passing)" value={q.explanation ?? ""} onChange={(e) => upd(i, (x) => ({ ...x, explanation: e.target.value }))} />
                </CardContent></Card>
              ))}
              <div><Button type="button" variant="outline" size="sm" onClick={() => setQs((a) => [...a, blankQ()])}><PlusIcon />Add question</Button></div>
            </>}
            <label className="flex items-center gap-2 text-sm"><Switch checked={v.required} onCheckedChange={set("required")} />Students must finish this to complete the course</label>
          </FieldGroup>
          <DialogFooter><Button type="submit" disabled={busy}>{busy && <Spinner />}Save lesson</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
