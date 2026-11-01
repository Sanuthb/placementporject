"use client"

import * as React from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { api, toastError } from "@/lib/web/api"
import { fmtDateTime } from "@/lib/web/format"
import { useApi } from "@/lib/web/use-api"

type Row = { id: string; role: string; topic: string; status: string; createdAt: string; score: number | null }
type Feedback = { summary: string; score: number; strengths: string[]; improvements: string[]; perAnswer: { question: string; comment: string }[] }
type Interview = { id: string; role: string; topic: string; status: string; transcript: { role: "interviewer" | "student"; text: string }[]; feedback: Feedback | null; totalQuestions: number }

/** Practice interviews with an AI interviewer: pick a role and topic, answer five questions, get feedback. */
export function MockInterviews() {
  const list = useApi<Row[]>("/api/student/prep/mock-interviews")
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [role, setRole] = React.useState("")
  const [topic, setTopic] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  if (openId) return <Session id={openId} onBack={() => { setOpenId(null); list.reload() }} />
  async function start() {
    setBusy(true)
    try { const m = await api<{ id: string }>("/api/student/prep/mock-interviews", { method: "POST", body: { role: role.trim(), topic: topic.trim() } }); setOpenId(m.id) } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Card>
        <CardHeader><CardTitle>Start a practice interview</CardTitle><CardDescription>An AI interviewer asks you 5 questions, one at a time, then gives you feedback. Nothing here is shared with the placement office.</CardDescription></CardHeader>
        <CardContent>
          <FieldGroup>
            <Field><FieldLabel htmlFor="mi-role">Role you are preparing for</FieldLabel><Input id="mi-role" placeholder="Software engineer" value={role} onChange={(e) => setRole(e.target.value)} /></Field>
            <Field><FieldLabel htmlFor="mi-topic">Topic</FieldLabel><Input id="mi-topic" placeholder="Data structures, or HR and behavioural questions" value={topic} onChange={(e) => setTopic(e.target.value)} /></Field>
            <Button className="self-start" disabled={busy || role.trim().length < 2 || topic.trim().length < 2} onClick={start}>{busy && <Spinner />}Start</Button>
          </FieldGroup>
        </CardContent>
      </Card>
      <h3 className="text-sm font-medium">Past attempts</h3>
      {!list.data ? <Skeleton className="h-20" /> : list.data.length === 0 ? <p className="text-sm text-muted-foreground">No practice interviews yet.</p> : (
        <div className="flex flex-col gap-2">
          {list.data.map((r) => (
            <Card key={r.id} size="sm">
              <CardContent className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{r.role}</span><span className="text-muted-foreground">{r.topic} · {fmtDateTime(r.createdAt)}</span>
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
  if (!data) return <Skeleton className="h-48" />
  const waiting = data.status === "IN_PROGRESS" && data.transcript.at(-1)?.role === "interviewer"
  const asked = data.transcript.filter((t) => t.role === "interviewer").length

  async function send() {
    setBusy(true)
    try { await api(`/api/student/prep/mock-interviews/${id}/answer`, { method: "POST", body: { text: text.trim() } }); setText(""); reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  async function finish() {
    setBusy(true)
    try { await api(`/api/student/prep/mock-interviews/${id}/finish`, { method: "POST" }); reload() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={onBack}>Back</Button><span className="text-sm text-muted-foreground">{data.role} · {data.topic}</span>{data.status === "IN_PROGRESS" && <Badge variant="outline" className="ml-auto">Question {asked} of {data.totalQuestions}</Badge>}</div>
      {data.transcript.map((t, i) => (
        <div key={i} className={`rounded-md border p-3 text-sm ${t.role === "interviewer" ? "bg-muted" : ""}`}>
          <div className="pb-1 text-xs text-muted-foreground">{t.role === "interviewer" ? "Interviewer" : "You"}</div>
          <p className="whitespace-pre-wrap">{t.text}</p>
        </div>
      ))}
      {waiting && (
        <>
          <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your answer" />
          <div className="flex gap-2">
            <Button disabled={busy || !text.trim()} onClick={send}>{busy && <Spinner />}{asked >= data.totalQuestions ? "Send last answer" : "Send"}</Button>
            <Button variant="outline" disabled={busy || asked < 2} onClick={finish}>End now and get feedback</Button>
          </div>
        </>
      )}
      {data.feedback && (
        <Card>
          <CardHeader><CardTitle>Feedback <Badge className="ml-2">{data.feedback.score}/10</Badge></CardTitle><CardDescription>{data.feedback.summary}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div><div className="font-medium">What went well</div><ul className="list-disc pl-5">{data.feedback.strengths.map((s) => <li key={s}>{s}</li>)}</ul></div>
            <div><div className="font-medium">What to improve</div><ul className="list-disc pl-5">{data.feedback.improvements.map((s) => <li key={s}>{s}</li>)}</ul></div>
            {data.feedback.perAnswer.map((p, i) => <div key={i}><div className="font-medium">{p.question}</div><p className="text-muted-foreground">{p.comment}</p></div>)}
          </CardContent>
        </Card>
      )}
      {data.status === "IN_PROGRESS" && !waiting && <Alert><AlertTitle>One moment</AlertTitle><AlertDescription>The interviewer is preparing the next question. Refresh if it does not appear.</AlertDescription></Alert>}
    </div>
  )
}
