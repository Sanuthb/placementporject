"use client"

import * as React from "react"
import { toast } from "sonner"

import { OptionSelect } from "@/components/option-select"
import { ReportButtons } from "@/components/report-buttons"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { DIFFICULTIES, DOMAINS, DURATIONS, KINDS, KIND_LABEL, LANGUAGES, type Kind } from "@/lib/discussionEngine"
import { api, toastError } from "@/lib/web/api"
import { fmtDate, fmtDateTime, titleCase } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Row = { id: string; kind: Kind; topic: string; status: string; createdAt: string; score: number | null; assignmentId: string | null }
type Assigned = { id: string; title: string; kind: Kind; topic: string; difficulty: string; language: string; durationMin: number; dueAt: string | null; completed: number }
type Turn = { role: "student" | "ai"; speaker: string; text: string; voice?: boolean; kind?: string }
export type Evaluation = { summary: string; score: number; categories: { key: string; label: string; score: number; comment: string }[]; strengths: string[]; improvements: string[]; perContribution: { excerpt: string; comment: string; better: string }[]; missedPoints: string[]; practice: string[] }
type Stats = { contributions: number; studentWords: number; aiWords: number; sharePercent: number; averageWords: number; shortest: number; longest: number; spokenContributions: number }
type Comparison = { overallChange: number; improved: string[]; slipped: string[]; categories: { key: string; before: number }[] } | null
type Session = { id: string; kind: Kind; topic: string; stance: string | null; durationMin: number; language: string; participants: { name: string; style: string }[]; status: string; transcript: Turn[]; evaluation: Evaluation | null; stats: Stats; comparison: Comparison; deadline: string | null; contributionCount: number; sharedWithStaff: boolean; voiceConsent: boolean }

// Speech recognition runs on the student's device. Nothing is recorded or uploaded; only the text they send.
type Rec = { lang: string; continuous: boolean; interimResults: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start: () => void; stop: () => void }
const speech = (): (new () => Rec) | null => (typeof window === "undefined" ? null : ((window as unknown as { SpeechRecognition?: new () => Rec }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition ?? null))
const LANG_CODE: Record<string, string> = { English: "en-IN", Hindi: "hi-IN", Telugu: "te-IN", Tamil: "ta-IN", Kannada: "kn-IN", Malayalam: "ml-IN", Marathi: "mr-IN", Bengali: "bn-IN", Gujarati: "gu-IN" }
const opt = (xs: readonly (string | number)[], label: (x: string) => string = (x) => x) => xs.map((x) => ({ value: String(x), label: label(String(x)) }))

/** Group discussions with AI participants, debates against an AI opponent and presentation practice, with an evaluation of how well the student communicated. */
export function DiscussionPractice() {
  const list = useApi<Row[]>("/api/student/discussions")
  const assigned = useApi<Assigned[]>("/api/student/discussions/assigned")
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [f, setF] = React.useState({ kind: "GD", topic: "", stance: "FOR", difficulty: "MEDIUM", language: "English", durationMin: "10", domain: "" })
  const [seed, setSeed] = React.useState(0)
  const [ai, setAi] = React.useState(false)
  const topics = useApi<{ source: string; topics: string[] }>("/api/student/discussions/topics", { kind: f.kind, domain: f.domain || undefined, difficulty: f.difficulty, language: f.language, ai: ai ? "1" : "0", seed })
  const [voice, setVoice] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const canSpeak = React.useMemo(() => !!speech(), [])
  const set = (p: Partial<typeof f>) => setF((o) => ({ ...o, ...p }))

  if (openId) return <Live id={openId} onBack={() => { setOpenId(null); list.reload(); assigned.reload() }} />
  async function start(body: object) {
    setBusy(true)
    try { const m = await api<{ id: string }>("/api/student/discussions", { method: "POST", body }); setOpenId(m.id) } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  async function checkMic() {
    try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach((t) => t.stop()); setVoice(true); toast.success("Microphone works. Nothing is recorded; your speech is turned into text on your device") } catch { setVoice(false); toast.error("The microphone is blocked. Allow it in your browser, or type") }
  }
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {assigned.data && assigned.data.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Set up for you</CardTitle><CardDescription>The placement office will see your report for these.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {assigned.data.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm">
                <div className="min-w-0 flex-1"><div className="font-medium">{a.title}</div><div className="text-xs text-muted-foreground">{KIND_LABEL[a.kind]} · {a.topic} · {a.durationMin} min · {a.language}{a.dueAt ? ` · by ${fmtDate(a.dueAt)}` : ""}</div></div>
                {a.completed > 0 && <Badge variant="secondary">Done {a.completed}×</Badge>}
                <Button size="sm" disabled={busy} onClick={() => start({ assignmentId: a.id, voiceConsent: voice })}>{busy && <Spinner />}{a.completed ? "Take again" : "Start"}</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>Practise speaking and persuading</CardTitle><CardDescription>Take part in a group discussion with AI participants, debate an AI opponent, or give a short presentation and answer questions. You get an evaluation of how you communicated. Sessions you start yourself are private.</CardDescription></CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field><FieldLabel>Kind</FieldLabel><OptionSelect className="w-full" value={f.kind} onChange={(v) => set({ kind: v, topic: "" })} options={KINDS.map(([value, label]) => ({ value, label }))} placeholder="Kind" /></Field>
              <Field><FieldLabel>Length</FieldLabel><OptionSelect className="w-full" value={f.durationMin} onChange={(v) => set({ durationMin: v })} options={opt(DURATIONS, (x) => `${x} minutes`)} placeholder="Length" /></Field>
              <Field><FieldLabel>Difficulty</FieldLabel><OptionSelect className="w-full" value={f.difficulty} onChange={(v) => set({ difficulty: v })} options={opt(DIFFICULTIES, titleCase)} placeholder="Difficulty" /></Field>
              <Field><FieldLabel>Language</FieldLabel><OptionSelect className="w-full" value={f.language} onChange={(v) => set({ language: v })} options={opt(LANGUAGES)} placeholder="Language" /></Field>
              <Field><FieldLabel>Area for topic ideas</FieldLabel><OptionSelect className="w-full" value={f.domain} onChange={(v) => set({ domain: v })} options={[{ value: "", label: "Any" }, ...DOMAINS.map(([value, label]) => ({ value, label }))]} placeholder="Any" /></Field>
              {f.kind === "DEBATE" && <Field><FieldLabel>Your side</FieldLabel><OptionSelect className="w-full" value={f.stance} onChange={(v) => set({ stance: v })} options={[{ value: "FOR", label: "For the motion" }, { value: "AGAINST", label: "Against the motion" }]} placeholder="Side" /></Field>}
            </div>
            <Field>
              <FieldLabel>Topic ideas</FieldLabel>
              {!topics.data ? <Skeleton className="h-20" /> : <div className="flex flex-col gap-1">{topics.data.topics.map((t) => <button key={t} type="button" onClick={() => set({ topic: t })} className={`rounded-md border p-2 text-left text-sm hover:bg-muted ${f.topic === t ? "border-primary" : ""}`}>{t}</button>)}</div>}
              <div className="flex flex-wrap gap-2 pt-1"><Button type="button" size="sm" variant="outline" onClick={() => { setAi(false); setSeed((x) => x + 1) }}>Show other ideas</Button><Button type="button" size="sm" variant="outline" onClick={() => { setAi(true); setSeed((x) => x + 1) }}>Ask the AI for new topics</Button>{topics.data && <span className="self-center text-xs text-muted-foreground">{topics.data.source === "AI" ? "Written by the AI" : "From the college's topic list"}</span>}</div>
            </Field>
            <Field><FieldLabel htmlFor="gd-topic">Or write your own topic</FieldLabel><Input id="gd-topic" value={f.topic} onChange={(e) => set({ topic: e.target.value })} /></Field>
            {canSpeak && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Button type="button" size="sm" variant="outline" onClick={checkMic}>{voice ? "Voice on" : "Speak instead of typing (check microphone)"}</Button>
                <span className="text-xs text-muted-foreground">Optional. Speech becomes text on your device; no audio or video is recorded or uploaded, and nothing is judged from your voice, accent or face.</span>
              </div>
            )}
            <Button className="self-start" disabled={busy || f.topic.trim().length < 8} onClick={() => start({ kind: f.kind, topic: f.topic.trim(), stance: f.kind === "DEBATE" ? f.stance : undefined, difficulty: f.difficulty, language: f.language, durationMin: Number(f.durationMin), voiceConsent: voice })}>{busy && <Spinner />}Start</Button>
          </FieldGroup>
        </CardContent>
      </Card>
      <h3 className="text-sm font-medium">Past sessions</h3>
      {!list.data ? <Skeleton className="h-20" /> : list.data.length === 0 ? <p className="text-sm text-muted-foreground">No sessions yet.</p> : list.data.map((r) => (
        <Card key={r.id} size="sm"><CardContent className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{KIND_LABEL[r.kind] ?? r.kind}</span><span className="min-w-0 flex-1 truncate text-muted-foreground">{r.topic} · {fmtDateTime(r.createdAt)}</span>
          {r.assignmentId && <Badge variant="outline">Set up for you</Badge>}{r.score !== null && <Badge>{r.score}/10</Badge>}
          <Button size="sm" variant="outline" onClick={() => setOpenId(r.id)}>{r.status === "IN_PROGRESS" ? "Continue" : "Review"}</Button>
        </CardContent></Card>
      ))}
    </div>
  )
}

function Live({ id, onBack }: { id: string; onBack: () => void }) {
  const { data, reload } = useApi<Session>(`/api/student/discussions/${id}`)
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
  const waiting = data.status === "IN_PROGRESS" && data.transcript.at(-1)?.role === "ai"
  const mine = data.transcript.filter((t) => t.role === "student").length
  const mm = timed === null ? "" : `${String(Math.floor(timed / 60)).padStart(2, "0")}:${String(timed % 60).padStart(2, "0")}`

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
    try { const r = await api<{ expired?: boolean }>(`/api/student/discussions/${id}/contribute`, { method: "POST", body: { text: text.trim(), voice: viaVoice } }); if (r.expired) toast.message("Time ran out. Your report covers what you said"); setText(""); setViaVoice(false); reload() } catch (e) { toastError(e); reload() } finally { setBusy(false) }
  }
  async function finish() {
    setBusy(true)
    try { await api(`/api/student/discussions/${id}/finish`, { method: "POST" }); reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  const ev = data.evaluation
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2"><Button variant="outline" size="sm" onClick={onBack}>Back</Button><Badge variant="outline">{KIND_LABEL[data.kind]}</Badge>{data.stance && <Badge variant="secondary">You argue {data.stance === "FOR" ? "for" : "against"}</Badge>}
        {data.status === "IN_PROGRESS" && <Badge variant="outline" className="ml-auto">Contribution {Math.min(mine + 1, data.contributionCount)} of {data.contributionCount}</Badge>}{timed !== null && <Badge variant={timed < 60 ? "destructive" : "secondary"}>{mm} left</Badge>}</div>
      <p className="text-sm font-medium">{data.topic}</p>
      <p className="text-xs text-muted-foreground">With: {data.participants.map((p) => p.name).join(", ")} (AI)</p>
      {data.sharedWithStaff && <Alert><AlertTitle>Visible to the placement office</AlertTitle><AlertDescription>This session was set up for you, so staff can read the transcript and report.</AlertDescription></Alert>}
      {data.transcript.map((t, i) => (
        <div key={i} className={`rounded-md border p-3 text-sm ${t.role === "ai" ? "bg-muted" : ""}`}>
          <div className="pb-1 text-xs text-muted-foreground">{t.role === "ai" ? `${t.speaker} (AI)` : `You${t.voice ? " (spoken, as text)" : ""}`}</div>
          <p className="whitespace-pre-wrap">{t.text}</p>
        </div>
      ))}
      {waiting && (
        <>
          <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={data.kind === "PRESENTATION" && mine === 0 ? "Give your presentation" : "Your turn. Respond to what was said and add your own point"} />
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || text.trim().length < 3} onClick={send}>{busy && <Spinner />}{mine + 1 >= data.contributionCount ? "Send last contribution" : "Send"}</Button>
            {data.voiceConsent && speech() && <Button variant="outline" disabled={busy} onClick={dictate}>{listening ? "Stop listening" : "Speak"}</Button>}
            <Button variant="outline" disabled={busy || mine < 1} onClick={finish}>End now and get the report</Button>
          </div>
        </>
      )}
      {data.status === "IN_PROGRESS" && !waiting && <Alert><AlertTitle>One moment</AlertTitle><AlertDescription>The others are replying. Refresh if it does not appear.</AlertDescription></Alert>}
      {ev && (
        <Card>
          <CardHeader><CardTitle>Evaluation <Badge className="ml-2">{ev.score}/10</Badge></CardTitle><CardDescription>Written by the AI from the words in the transcript. It is practice feedback, not a prediction of any selection result.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <div><ReportButtons path={`/api/student/reports/discussion/${id}`} label="Download this report" /></div>
            <p>{ev.summary}</p>
            {data.comparison && <p className="text-muted-foreground">Compared with your previous session of this kind: {data.comparison.overallChange >= 0 ? "+" : ""}{data.comparison.overallChange} overall.{data.comparison.improved.length > 0 && ` Better: ${data.comparison.improved.join(", ")}.`}{data.comparison.slipped.length > 0 && ` Lower: ${data.comparison.slipped.join(", ")}.`}</p>}
            <p className="text-xs text-muted-foreground">Counted, not judged: you made {data.stats.contributions} contribution{data.stats.contributions === 1 ? "" : "s"} ({data.stats.studentWords} words, {data.stats.sharePercent}% of everything said, {data.stats.averageWords} words on average).</p>
            <div className="flex flex-col gap-3">{ev.categories.map((c) => <div key={c.key} className="flex flex-col gap-1"><div className="flex justify-between"><span>{c.label}</span><span>{c.score}/10{data.comparison?.categories.find((x) => x.key === c.key) ? ` (before ${data.comparison.categories.find((x) => x.key === c.key)!.before})` : ""}</span></div><Progress value={c.score * 10} />{c.comment && <span className="text-xs text-muted-foreground">{c.comment}</span>}</div>)}</div>
            <div><div className="font-medium">What went well</div><ul className="list-disc pl-5">{ev.strengths.map((s) => <li key={s}>{s}</li>)}</ul></div>
            <div><div className="font-medium">What to improve</div><ul className="list-disc pl-5">{ev.improvements.map((s) => <li key={s}>{s}</li>)}</ul></div>
            {ev.perContribution.map((p, i) => <div key={i} className="flex flex-col gap-1"><div className="font-medium">&ldquo;{p.excerpt}&rdquo;</div><p className="text-muted-foreground">{p.comment}</p>{p.better && <p className="rounded bg-muted p-2"><span className="text-xs font-medium">A stronger version (AI suggestion): </span>{p.better}</p>}</div>)}
            {ev.missedPoints.length > 0 && <div><div className="font-medium">Points you could have raised or answered</div><ul className="list-disc pl-5">{ev.missedPoints.map((s) => <li key={s}>{s}</li>)}</ul></div>}
            {ev.practice.length > 0 && <div><div className="font-medium">Practise next</div><ul className="list-disc pl-5">{ev.practice.map((s) => <li key={s}>{s}</li>)}</ul></div>}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
