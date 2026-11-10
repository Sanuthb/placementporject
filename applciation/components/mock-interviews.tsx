"use client"

import * as React from "react"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { InterviewReport, type Report } from "@/components/interview-report"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { DIFFICULTIES, DURATIONS, INTERVIEW_TYPES, LANGUAGES, MODES, TYPE_LABEL, type InterviewType } from "@/lib/interviewEngine"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, fmtDateTime, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Row = { id: string; role: string; topic: string; status: string; createdAt: string; score: number | null; type: InterviewType; mode: string; assignmentId: string | null }
type Assigned = { id: string; title: string; type: InterviewType; mode: string; difficulty: string; durationMin: number; language: string; role: string; topic: string; dueAt: string | null; completed: number }
type Turn = { role: "interviewer" | "student" | "coach"; text: string; kind?: "hint" | "improve"; voice?: boolean }
type Interview = { id: string; role: string; topic: string; status: string; type: InterviewType; mode: "LEARNING" | "ASSESSMENT"; difficulty: string; language: string; durationMin: number; transcript: Turn[]; feedback: Report | null; comparison: Parameters<typeof InterviewReport>[0]["comparison"]; deadline: string | null; totalQuestions: number; sharedWithStaff: boolean; voiceConsent: boolean }

// The browser's speech recognition (where it has one) turns speech into text on the student's device. Nothing is recorded or uploaded; only the text they send.
type Rec = { lang: string; continuous: boolean; interimResults: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start: () => void; stop: () => void }
const speech = (): (new () => Rec) | null => (typeof window === "undefined" ? null : ((window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition ?? null))
const LANG_CODE: Record<string, string> = { English: "en-IN", Hindi: "hi-IN", Telugu: "te-IN", Tamil: "ta-IN", Kannada: "kn-IN", Malayalam: "ml-IN", Marathi: "mr-IN", Bengali: "bn-IN", Gujarati: "gu-IN" }
const opt = (xs: readonly (string | number)[], label: (x: string) => string = (x) => x) => xs.map((x) => ({ value: String(x), label: label(String(x)) }))

/** Practice interviews with an AI interviewer, and the ones the placement office has set up for me. */
export function MockInterviews() {
  const list = useApi<Row[]>("/api/student/prep/mock-interviews")
  const assigned = useApi<Assigned[]>("/api/student/prep/mock-interviews/assigned")
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [f, setF] = React.useState({ role: "", topic: "", type: "TECHNICAL", mode: "LEARNING", difficulty: "MEDIUM", durationMin: "20", language: "English" })
  const [voice, setVoice] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const canSpeak = React.useMemo(() => !!speech(), [])

  if (openId) return <Session id={openId} onBack={() => { setOpenId(null); list.reload(); assigned.reload() }} />
  async function start(body: object) {
    setBusy(true)
    try { const m = await api<{ id: string }>("/api/student/prep/mock-interviews", { method: "POST", body }); setOpenId(m.id) } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  async function checkMic() {
    try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach((t) => t.stop()); setVoice(true); toast.success("Microphone works. Nothing is recorded; your speech is turned into text on your device") } catch { setVoice(false); toast.error("The microphone is blocked. Allow it in your browser, or type your answers") }
  }
  const set = (p: Partial<typeof f>) => setF((o) => ({ ...o, ...p }))
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {assigned.data && assigned.data.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Set up for you</CardTitle><CardDescription>The placement office will see your report for these.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {assigned.data.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm">
                <div className="min-w-0 flex-1"><div className="font-medium">{a.title}</div><div className="text-xs text-muted-foreground">{TYPE_LABEL[a.type]} · {titleCase(a.mode)} mode · {titleCase(a.difficulty)} · {a.durationMin} min · {a.language}{a.dueAt ? ` · by ${fmtDate(a.dueAt)}` : ""}</div></div>
                {a.completed > 0 && <Badge variant="secondary">Done {a.completed}×</Badge>}
                <Button size="sm" disabled={busy} onClick={() => start({ assignmentId: a.id, voiceConsent: voice })}>{busy && <Spinner />}{a.completed ? "Take again" : "Start"}</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>Start a practice interview</CardTitle><CardDescription>An AI interviewer asks questions one at a time, then gives you a report. Interviews you start yourself are private: nobody at the placement office sees them.</CardDescription></CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field><FieldLabel>Kind of interview</FieldLabel><OptionSelect className="w-full" value={f.type} onChange={(v) => set({ type: v })} options={INTERVIEW_TYPES.map(([value, label]) => ({ value, label }))} placeholder="Kind" /></Field>
              <Field><FieldLabel>Mode</FieldLabel><OptionSelect className="w-full" value={f.mode} onChange={(v) => set({ mode: v })} options={MODES.map(([value, label]) => ({ value, label }))} placeholder="Mode" /></Field>
              <Field><FieldLabel>Difficulty</FieldLabel><OptionSelect className="w-full" value={f.difficulty} onChange={(v) => set({ difficulty: v })} options={opt(DIFFICULTIES, titleCase)} placeholder="Difficulty" /></Field>
              <Field><FieldLabel>Length</FieldLabel><OptionSelect className="w-full" value={f.durationMin} onChange={(v) => set({ durationMin: v })} options={opt(DURATIONS, (x) => `${x} minutes`)} placeholder="Length" /></Field>
              <Field><FieldLabel>Language</FieldLabel><OptionSelect className="w-full" value={f.language} onChange={(v) => set({ language: v })} options={opt(LANGUAGES)} placeholder="Language" /></Field>
            </div>
            <Field><FieldLabel htmlFor="mi-role">Role you are preparing for</FieldLabel><Input id="mi-role" placeholder="Software engineer" value={f.role} onChange={(e) => set({ role: e.target.value })} /></Field>
            <Field><FieldLabel htmlFor="mi-topic">Topic{f.type === "COMPANY" ? " (name the company and what it is known for)" : ""}</FieldLabel><Input id="mi-topic" placeholder="Data structures, or teamwork and leadership" value={f.topic} onChange={(e) => set({ topic: e.target.value })} /></Field>
            {canSpeak && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Button type="button" size="sm" variant="outline" onClick={checkMic}>{voice ? "Voice answers on" : "Answer by voice (check microphone)"}</Button>
                <span className="text-xs text-muted-foreground">Optional. Speech becomes text on your device; no audio or video is recorded or uploaded, and nothing is judged from your voice or face.</span>
              </div>
            )}
            <Button className="self-start" disabled={busy || f.role.trim().length < 2 || f.topic.trim().length < 2} onClick={() => start({ ...f, durationMin: Number(f.durationMin), voiceConsent: voice })}>{busy && <Spinner />}Start</Button>
          </FieldGroup>
        </CardContent>
      </Card>
      <h3 className="text-sm font-medium">Past attempts</h3>
      {!list.data ? <Skeleton className="h-20" /> : list.data.length === 0 ? <p className="text-sm text-muted-foreground">No practice interviews yet.</p> : (
        <div className="flex flex-col gap-2">
          {list.data.map((r) => (
            <Card key={r.id} size="sm">
              <CardContent className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{r.role}</span><span className="text-muted-foreground">{TYPE_LABEL[r.type] ?? r.type} · {r.topic} · {fmtDateTime(r.createdAt)}</span>
                {r.assignmentId && <Badge variant="outline">Set up for you</Badge>}
                {r.score !== null && <Badge>{r.score}/10</Badge>}
                <Button size="sm" variant="outline" className="ml-auto" onClick={() => setOpenId(r.id)}>{r.status === "IN_PROGRESS" ? "Continue" : "Review"}</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function Session({ id, onBack }: { id: string; onBack: () => void }) {
  const { data, reload } = useApi<Interview>(`/api/student/prep/mock-interviews/${id}`)
  const [text, setText] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [listening, setListening] = React.useState(false)
  const [viaVoice, setViaVoice] = React.useState(false)
  const [left, setLeft] = React.useState<number | null>(null)
  const rec = React.useRef<Rec | null>(null)

  React.useEffect(() => {
    if (!data?.deadline || data.status !== "IN_PROGRESS") return
    const end = new Date(data.deadline).getTime()
    const t = setInterval(() => setLeft(Math.max(0, Math.round((end - Date.now()) / 1000))), 1000)
    return () => clearInterval(t)
  }, [data?.deadline, data?.status])
  React.useEffect(() => () => rec.current?.stop(), [])

  if (!data) return <Skeleton className="h-48" />
  const timed = data.deadline && data.status === "IN_PROGRESS" ? left : null
  const waiting = data.status === "IN_PROGRESS" && data.transcript.filter((t) => t.role !== "coach").at(-1)?.role === "interviewer"
  const asked = data.transcript.filter((t) => t.role === "interviewer").length
  const hinted = data.transcript.at(-1)?.kind === "hint"

  function dictate() {
    const R = speech(); if (!R) return
    if (listening) { rec.current?.stop(); return }
    const r = new R(); r.lang = LANG_CODE[data!.language] ?? "en-IN"; r.continuous = true; r.interimResults = false
    r.onresult = (e) => { const said = Array.from(e.results).map((x) => x[0].transcript).join(" ").trim(); if (said) { setText((o) => `${o ? `${o} ` : ""}${said}`.trim()); setViaVoice(true) } }
    r.onend = () => setListening(false); r.onerror = () => { setListening(false); toast.error("Voice input stopped. You can type instead") }
    rec.current = r; r.start(); setListening(true)
  }
  async function send() {
    rec.current?.stop(); setBusy(true)
    try { const r = await api<{ done: boolean; expired?: boolean }>(`/api/student/prep/mock-interviews/${id}/answer`, { method: "POST", body: { text: text.trim(), voice: viaVoice } }); if (r.expired) toast.message("Time ran out. Your report covers the answers you gave"); setText(""); setViaVoice(false); reload() } catch (e) { toastError(e); reload() } finally { setBusy(false) }
  }
  async function finish() {
    setBusy(true)
    try { await api(`/api/student/prep/mock-interviews/${id}/finish`, { method: "POST" }); reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  async function hint() {
    setBusy(true)
    try { await api(`/api/student/prep/mock-interviews/${id}/hint`, { method: "POST" }); reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  const mm = timed === null ? "" : `${String(Math.floor(timed / 60)).padStart(2, "0")}:${String(timed % 60).padStart(2, "0")}`
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2"><Button variant="outline" size="sm" onClick={onBack}>Back</Button><span className="text-sm text-muted-foreground">{TYPE_LABEL[data.type]} · {data.role} · {data.topic}</span>
        <Badge variant="outline">{data.mode === "LEARNING" ? "Learning mode" : "Assessment mode"}</Badge>
        {data.status === "IN_PROGRESS" && <Badge variant="outline" className="ml-auto">Question {asked} of {data.totalQuestions}</Badge>}{timed !== null && <Badge variant={timed < 60 ? "destructive" : "secondary"}>{mm} left</Badge>}</div>
      {data.sharedWithStaff && <Alert><AlertTitle>Visible to the placement office</AlertTitle><AlertDescription>This interview was set up for you, so staff can read the transcript and report.</AlertDescription></Alert>}
      {data.transcript.map((t, i) => (
        <div key={i} className={`rounded-md border p-3 text-sm ${t.role === "interviewer" ? "bg-muted" : t.role === "coach" ? "border-dashed" : ""}`}>
          <div className="pb-1 text-xs text-muted-foreground">{t.role === "interviewer" ? "Interviewer (AI)" : t.role === "coach" ? (t.kind === "hint" ? "Hint (AI coach)" : "Coach's note (AI)") : `You${t.voice ? " (spoken, as text)" : ""}`}</div>
          <p className="whitespace-pre-wrap">{t.text}</p>
        </div>
      ))}
      {waiting && (
        <>
          <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={data.mode === "ASSESSMENT" ? "Type your answer. No hints in assessment mode" : "Type your answer"} />
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || !text.trim()} onClick={send}>{busy && <Spinner />}{asked >= data.totalQuestions ? "Send last answer" : "Send"}</Button>
            {data.voiceConsent && speech() && <Button variant="outline" disabled={busy} onClick={dictate}>{listening ? "Stop listening" : "Speak your answer"}</Button>}
            {data.mode === "LEARNING" && <Button variant="outline" disabled={busy || hinted} onClick={hint}>Give me a hint</Button>}
            <Button variant="outline" disabled={busy || data.transcript.filter((t) => t.role === "student").length < 1} onClick={finish}>End now and get the report</Button>
          </div>
        </>
      )}
      {data.feedback && <InterviewReport feedback={data.feedback} comparison={data.comparison} downloadPath={`/api/student/reports/interview/${id}`} />}
      {data.status === "IN_PROGRESS" && !waiting && <Alert><AlertTitle>One moment</AlertTitle><AlertDescription>The interviewer is preparing the next question. Refresh if it does not appear.</AlertDescription></Alert>}
    </div>
  )
}
